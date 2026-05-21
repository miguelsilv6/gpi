import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { getRelatorio } from '@/lib/relatorios'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { RATE_LIMITS } from '@/lib/constants'
import { toCSV, toMarkdown, UTF8_BOM } from '@/lib/relatorios/formatters'
import { RelatorioPDF } from '@/components/relatorios/relatorio-pdf'
import { pdf, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import type { Role } from '@/generated/prisma/enums'

/**
 * GET /api/relatorios/[id]?format=preview|csv|md|pdf&...filtros
 *
 *  - preview (default): JSON com o RelatorioResult (sem audit)
 *  - csv: text/csv com BOM + Content-Disposition attachment
 *  - md: text/markdown
 *  - pdf: application/pdf via @react-pdf/renderer
 *
 * Audit `EXPORT_RELATORIO` apenas nos formatos não-preview.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!hasPermission(role, 'relatorio:read')) {
      return apiError('Sem permissão para aceder a relatórios', 403)
    }

    const { id } = await ctx.params
    const relatorio = getRelatorio(id)
    if (!relatorio) {
      return apiError(`Relatório "${id}" não existe`, 404)
    }

    const { searchParams } = new URL(req.url)
    const format = searchParams.get('format') ?? 'preview'

    // Rate-limit apenas formatos de export — preview é JSON leve.
    if (format !== 'preview') {
      const limited = enforceRateLimit({
        key: `relatorio:export:${clientFingerprint(req)}:${session.user.id}`,
        ...RATE_LIMITS.REPORT_EXPORT,
      })
      if (limited) return limited
    }

    // Executa o handler — INSPETOR_CHEFE é confinado dentro de cada handler.
    const result = await relatorio.handler(searchParams, {
      id: session.user.id,
      nome: session.user.nome,
      role,
      brigadaId: session.user.brigadaId,
    })

    if (format === 'preview') {
      return Response.json(result)
    }

    // Audit antes de gerar — assim mesmo se a geração falhar, fica registo.
    const filtrosResumo: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(result.filtros)) {
      filtrosResumo[k] = v
    }
    await writeAudit({
      req,
      acao: 'EXPORT_RELATORIO',
      entidade: 'Relatorio',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: {
        format,
        filtros: filtrosResumo,
        rowCount: result.rows.length,
      },
    })

    const datestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const baseName = `relatorio-${id}-${datestamp}`

    if (format === 'csv') {
      const body = UTF8_BOM + toCSV(result)
      return new Response(body, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${baseName}.csv"`,
        },
      })
    }

    if (format === 'md') {
      const body = toMarkdown(result)
      return new Response(body, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${baseName}.md"`,
        },
      })
    }

    if (format === 'pdf') {
      // createElement em vez de JSX para manter o ficheiro como .ts (sem
      // tsconfig de transformação para .tsx em routes API). O cast é
      // necessário porque `pdf()` espera um ReactElement<DocumentProps> e
      // o nosso wrapper RelatorioPDF devolve <Document/> mas o TS vê-o
      // como FunctionComponentElement.
      const element = createElement(RelatorioPDF, { data: result }) as unknown as ReactElement<DocumentProps>
      const stream = (await pdf(element).toBuffer()) as unknown as NodeJS.ReadableStream
      const chunks: Buffer[] = []
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk as Uint8Array))
      }
      const buf = Buffer.concat(chunks)
      return new Response(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${baseName}.pdf"`,
          'Content-Length': String(buf.length),
        },
      })
    }

    return apiError(`Formato desconhecido: ${format}`, 400)
  } catch (error) {
    return handleApiError(error)
  }
}
