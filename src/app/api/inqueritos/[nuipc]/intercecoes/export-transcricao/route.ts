import { NextRequest } from 'next/server'
import { handleApiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadIntercecaoContext } from '@/lib/intercecoes-api'
import { buildTranscricaoWorkbook } from '@/lib/intercecoes-xlsx'
import { getDadosTranscricao } from '@/lib/intercecoes-export'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — exporta em Excel os produtos de interesse com transcrição pedida,
 * autorizada ou já feita (worklist do transcritor). O acesso é o do módulo
 * (leitura do inquérito no scope), como a exportação geral das interceções.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadIntercecaoContext(slug)
    if (ctx instanceof Response) return ctx

    const { data, total } = await getDadosTranscricao(ctx.inquerito.id, ctx.inquerito.nuipc)
    const wb = buildTranscricaoWorkbook(data)
    const buffer = await wb.xlsx.writeBuffer()

    await writeAudit({
      req,
      acao: 'EXPORT_TRANSCRICOES_XLSX',
      entidade: 'Inquerito',
      entidadeId: ctx.inquerito.id,
      utilizadorId: ctx.userId,
      detalhes: { nuipc: ctx.inquerito.nuipc, produtos: total },
    })

    const safeNuipc = ctx.inquerito.nuipc.replace(/[^A-Za-z0-9._-]+/g, '_')
    return new Response(buffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="transcricoes-${safeNuipc}.xlsx"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
