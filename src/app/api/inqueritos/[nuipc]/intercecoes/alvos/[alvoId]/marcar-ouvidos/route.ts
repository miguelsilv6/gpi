import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadIntercecaoContext } from '@/lib/intercecoes-api'
import { marcarProdutosOuvidos } from '@/lib/intercecoes-ouvidos'
import { formatDataHoraPt } from '@/lib/datetime-pt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST — marcar como ouvidos os produtos do alvo com data/hora ≤ "acompanhado
 * até" (o valor guardado no alvo, não um valor enviado pelo cliente).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; alvoId: string }> },
) {
  try {
    const { nuipc: slug, alvoId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const alvo = await prisma.intercecaoAlvo.findUnique({
      where: { id: alvoId },
      select: { id: true, nome: true, inqueritoid: true, acompanhadoAte: true },
    })
    if (!alvo || alvo.inqueritoid !== ctx.inquerito.id) {
      return apiError('Alvo não encontrado', 404)
    }
    if (!alvo.acompanhadoAte) {
      return apiError('Defina primeiro a data/hora de acompanhamento', 400)
    }

    const marcados = await marcarProdutosOuvidos(alvo.id, alvo.acompanhadoAte)

    await writeAudit({
      req,
      acao: 'UPDATE_INTERCECAO_PRODUTOS_OUVIDOS',
      entidade: 'IntercecaoAlvo',
      entidadeId: alvo.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        alvoNome: alvo.nome,
        ate: formatDataHoraPt(alvo.acompanhadoAte),
        marcados,
      },
    })

    return Response.json({ marcados })
  } catch (error) {
    return handleApiError(error)
  }
}

