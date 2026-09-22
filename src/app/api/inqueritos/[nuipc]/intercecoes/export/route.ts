import { NextRequest } from 'next/server'
import { handleApiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadIntercecaoContext } from '@/lib/intercecoes-api'
import { buildIntercecoesWorkbook } from '@/lib/intercecoes-xlsx'
import { getDadosExportacao } from '@/lib/intercecoes-export'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — exporta as interceções do inquérito em Excel (.xlsx), no formato do
 * modelo de controlo de escutas. O acesso é o do módulo (leitura do inquérito
 * no scope); não requer a permissão `inquerito:export` do CSV geral.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadIntercecaoContext(slug)
    if (ctx instanceof Response) return ctx

    const dados = await getDadosExportacao(ctx.inquerito.id, ctx.inquerito.nuipc)

    const wb = buildIntercecoesWorkbook(dados)
    const buffer = await wb.xlsx.writeBuffer()

    await writeAudit({
      req,
      acao: 'EXPORT_INTERCECOES_XLSX',
      entidade: 'Inquerito',
      entidadeId: ctx.inquerito.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        alvos: dados.alvos.length,
        linhas: dados.alvos.reduce((n, a) => n + a.linhas.length, 0),
        produtos: dados.alvos.reduce((n, a) => n + a.produtos.length, 0),
        relacoes: dados.relacoes.length,
        validacoes: dados.validacoes.length,
      },
    })

    const safeNuipc = ctx.inquerito.nuipc.replace(/[^A-Za-z0-9._-]+/g, '_')
    return new Response(buffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="intercecoes-${safeNuipc}.xlsx"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
