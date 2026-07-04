import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadIntercecaoContext } from '@/lib/intercecoes-api'
import { buildIntercecoesWorkbook } from '@/lib/intercecoes-xlsx'

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

    const alvos = await prisma.intercecaoAlvo.findMany({
      where: { inqueritoid: ctx.inquerito.id },
      orderBy: { codigo: 'asc' },
      select: {
        nome: true,
        codigo: true,
        observacoes: true,
        notas: true,
        linhas: {
          orderBy: { dataInicio: 'asc' },
          select: {
            tipo: true,
            identificador: true,
            rede: true,
            dataInicio: true,
            dataFim: true,
            renovacoes: true,
            observacoes: true,
          },
        },
        produtos: {
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

    const wb = buildIntercecoesWorkbook({ nuipc: ctx.inquerito.nuipc, alvos })
    const buffer = await wb.xlsx.writeBuffer()

    await writeAudit({
      req,
      acao: 'EXPORT_INTERCECOES_XLSX',
      entidade: 'Inquerito',
      entidadeId: ctx.inquerito.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        alvos: alvos.length,
        linhas: alvos.reduce((n, a) => n + a.linhas.length, 0),
        produtos: alvos.reduce((n, a) => n + a.produtos.length, 0),
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
