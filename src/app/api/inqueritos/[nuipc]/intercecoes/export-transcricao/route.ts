import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadIntercecaoContext } from '@/lib/intercecoes-api'
import { buildTranscricaoWorkbook } from '@/lib/intercecoes-xlsx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — exporta em Excel apenas os produtos de interesse marcados para
 * transcrição (worklist do transcritor). O acesso é o do módulo (leitura do
 * inquérito no scope), como a exportação geral das interceções.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadIntercecaoContext(slug)
    if (ctx instanceof Response) return ctx

    const alvos = await prisma.intercecaoAlvo.findMany({
      where: {
        inqueritoid: ctx.inquerito.id,
        produtos: { some: { paraTranscricao: true } },
      },
      orderBy: { codigo: 'asc' },
      select: {
        nome: true,
        codigo: true,
        produtos: {
          where: { paraTranscricao: true },
          orderBy: { data: 'asc' },
          select: {
            tipo: true,
            numeroProduto: true,
            direcao: true,
            data: true,
            horaInicio: true,
            horaFim: true,
            duracao: true,
            paraTranscricao: true,
            de: true,
            para: true,
            resumo: true,
            comentarios: true,
            linha: { select: { identificador: true } },
          },
        },
      },
    })

    const total = alvos.reduce((n, a) => n + a.produtos.length, 0)
    const wb = buildTranscricaoWorkbook({ nuipc: ctx.inquerito.nuipc, alvos })
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
