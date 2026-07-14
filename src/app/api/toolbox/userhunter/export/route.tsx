import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { RATE_LIMITS } from '@/lib/constants'
import { writeAudit } from '@/lib/audit'
import { USERNAME_REGEX } from '@/lib/toolbox/userhunter'
import { toCSV, toMarkdown, UTF8_BOM } from '@/lib/relatorios/formatters'
import type { RelatorioResult } from '@/lib/relatorios/types'
import { RelatorioPDF } from '@/components/relatorios/relatorio-pdf'
import { pdf } from '@react-pdf/renderer'
import { getBrand } from '@/lib/brand'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  username: z.string().min(1).max(64).regex(USERNAME_REGEX),
  plataformasAnalisadas: z.number().int().min(0).max(1000),
  encontrados: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        categoria: z.string().min(1).max(100),
        url: z.string().min(1).max(500),
        status: z.number().int(),
      }),
    )
    .max(200),
  format: z.enum(['csv', 'md', 'pdf']),
})

/**
 * Exporta o resultado de uma pesquisa userhunter já obtida pelo cliente
 * (POST em vez do padrão GET de /api/relatorios/[id] porque o payload é
 * o próprio resultado da pesquisa, não um id — evita repetir o varrimento
 * das 70+ plataformas só para gerar o ficheiro).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloToolboxAtivo(role))) {
      return apiError('O módulo Toolbox está desativado', 503)
    }

    const limited = enforceRateLimit({
      key: `toolbox:userhunter-export:${clientFingerprint(req)}:${session.user.id}`,
      ...RATE_LIMITS.REPORT_EXPORT,
    })
    if (limited) return limited

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { username, plataformasAnalisadas, encontrados, format } = parsed.data

    const result: RelatorioResult = {
      title: `Pesquisa de username: ${username}`,
      geradoEm: new Date(),
      geradoPor: session.user.nome,
      filtros: { username, plataformasAnalisadas: String(plataformasAnalisadas) },
      columns: [
        { key: 'plataforma', label: 'Plataforma', flex: 1.2 },
        { key: 'categoria', label: 'Categoria', flex: 1.5 },
        { key: 'url', label: 'URL', flex: 2.5 },
        { key: 'status', label: 'HTTP', align: 'right', flex: 0.6 },
      ],
      rows: encontrados.map((e) => ({
        plataforma: e.name,
        categoria: e.categoria,
        url: e.url,
        status: e.status,
      })),
      summary: [
        { label: 'Plataformas analisadas', value: plataformasAnalisadas },
        { label: 'Perfis encontrados', value: encontrados.length },
      ],
      emptyMessage: 'Nenhum perfil encontrado nas plataformas analisadas.',
    }

    await writeAudit({
      req,
      acao: 'TOOLBOX_USERHUNTER_EXPORT',
      entidade: 'Toolbox',
      entidadeId: username,
      utilizadorId: session.user.id,
      detalhes: { username, format, rowCount: result.rows.length },
    })

    const datestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const baseName = `userhunter-${username}-${datestamp}`

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
          pdfHeaderText: brand.pdfHeaderText,
          pdfWatermarkText: brand.pdfWatermarkText,
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
