import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { RATE_LIMITS } from '@/lib/constants'
import { writeAudit } from '@/lib/audit'
import { EMAIL_REGEX, toRelatorioRows, type EmailHunterResult } from '@/lib/toolbox/emailhunter'
import { toCSV, toMarkdown, UTF8_BOM } from '@/lib/relatorios/formatters'
import type { RelatorioResult } from '@/lib/relatorios/types'
import { RelatorioPDF } from '@/components/relatorios/relatorio-pdf'
import { pdf } from '@react-pdf/renderer'
import { getBrand } from '@/lib/brand'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const nullableString = z.string().max(2000).nullable()

const schema = z.object({
  email: z.string().min(3).max(254).regex(EMAIL_REGEX),
  format: z.enum(['csv', 'md', 'pdf']),
  resultado: z.object({
    email: z.string().min(3).max(254),
    smtp: z.object({
      dominio: z.string().max(254),
      servidorMx: z.string().max(254),
      estado: z.enum(['valido', 'invalido', 'indeterminado']),
      detalhe: z.string().max(500),
    }),
    emailRep: z.object({
      disponivel: z.boolean(),
      reputacao: nullableString,
      suspeito: z.boolean().nullable(),
      referencias: z.number().nullable(),
      blacklisted: z.boolean().nullable(),
      atividadeMaliciosa: z.boolean().nullable(),
      credenciaisExpostas: z.boolean().nullable(),
      dataBreach: z.boolean().nullable(),
      primeiraVista: nullableString,
      ultimaVista: nullableString,
      spf: z.boolean().nullable(),
      dmarc: z.boolean().nullable(),
      deliverable: z.boolean().nullable(),
      freeProvider: z.boolean().nullable(),
      disposable: z.boolean().nullable(),
      perfis: z.array(z.string().max(200)).max(50),
      mensagem: z.string().max(500).optional(),
    }),
    hudsonRock: z.object({
      disponivel: z.boolean(),
      encontrados: z.number().int().min(0),
      registos: z
        .array(
          z.object({
            data: nullableString,
            stealer: nullableString,
            os: nullableString,
            passwordParcial: nullableString,
            url: nullableString,
          }),
        )
        .max(20),
      mensagem: z.string().max(500).optional(),
    }),
    breachCheck: z.object({
      proxynova: z.object({
        disponivel: z.boolean(),
        total: z.number().int().min(0),
        amostra: z.array(z.string().max(500)).max(20),
        mensagem: z.string().max(500).optional(),
      }),
      hibp: z.object({
        disponivel: z.boolean(),
        breachesDominio: z
          .array(
            z.object({
              nome: z.string().max(200),
              data: nullableString,
              contasComprometidas: z.number().int().min(0),
              dadosExpostos: z.array(z.string().max(100)).max(20),
            }),
          )
          .max(20),
        mensagem: z.string().max(500).optional(),
      }),
      linksManuais: z.array(z.object({ nome: z.string().max(200), url: z.string().max(500) })).max(20),
    }),
    gravatar: z.object({
      encontrado: z.boolean(),
      displayName: nullableString,
      username: nullableString,
      perfilUrl: nullableString,
      avatarUrl: z.string().max(500),
      bio: nullableString,
      redes: z.array(z.object({ rede: z.string().max(100), url: z.string().max(500) })).max(50),
      mensagem: z.string().max(500).optional(),
    }),
    googleDorks: z.array(z.object({ descricao: z.string().max(200), url: z.string().max(1000) })).max(20),
    domainInfo: z.object({
      dominio: z.string().max(254),
      ip: nullableString,
      proveedor: nullableString,
      tipoProveedor: z.enum(['gratuito', 'cifrado', 'descartavel', 'corporativo']),
      registrar: nullableString,
      criado: nullableString,
      expira: nullableString,
    }),
    elapsedMs: z.number(),
  }),
})

/**
 * Exporta o resultado de uma pesquisa email-hunter já obtida pelo cliente
 * (POST em vez do padrão GET de /api/relatorios/[id] porque o payload é o
 * próprio resultado da pesquisa — evita repetir o varrimento das 6 fontes
 * só para gerar o ficheiro).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloToolboxAtivo(role))) {
      return apiError('O módulo Toolbox está desativado', 503)
    }

    const limited = enforceRateLimit({
      key: `toolbox:email-hunter-export:${clientFingerprint(req)}:${session.user.id}`,
      ...RATE_LIMITS.REPORT_EXPORT,
    })
    if (limited) return limited

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { email, format, resultado } = parsed.data
    const rows = toRelatorioRows(resultado as EmailHunterResult)

    const result: RelatorioResult = {
      title: `Pesquisa de email: ${email}`,
      geradoEm: new Date(),
      geradoPor: session.user.nome,
      filtros: { email },
      columns: [
        { key: 'seccao', label: 'Secção', flex: 1.2 },
        { key: 'campo', label: 'Campo', flex: 1.5 },
        { key: 'valor', label: 'Valor', flex: 2.5 },
      ],
      rows,
      emptyMessage: 'Sem dados.',
    }

    await writeAudit({
      req,
      acao: 'TOOLBOX_EMAIL_HUNTER_EXPORT',
      entidade: 'Toolbox',
      entidadeId: email,
      utilizadorId: session.user.id,
      detalhes: { email, format, rowCount: result.rows.length },
    })

    const datestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const baseName = `email-hunter-${email.replace(/[^a-zA-Z0-9.@-]/g, '_')}-${datestamp}`

    if (format === 'csv') {
      const out = UTF8_BOM + toCSV(result)
      return new Response(out, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${baseName}.csv"`,
        },
      })
    }

    if (format === 'md') {
      const out = toMarkdown(result)
      return new Response(out, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${baseName}.md"`,
        },
      })
    }

    const brand = await getBrand()
    const stream = await pdf(
      <RelatorioPDF
        data={result}
        brand={{
          appName: brand.appName,
          appShortName: brand.appShortName,
          pdfFooterText: brand.pdfFooterText,
        }}
      />,
    ).toBuffer()
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer)
    }
    const buf = Buffer.concat(chunks)
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${baseName}.pdf"`,
        'Content-Length': String(buf.length),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
