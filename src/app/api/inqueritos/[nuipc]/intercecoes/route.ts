import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadIntercecaoContext } from '@/lib/intercecoes-api'
import { getIntercecoesTree } from '@/lib/intercecoes'
import { intercecaoAlvoCreateSchema } from '@/lib/validations/intercecao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET — árvore de alvos com linhas e contagem de produtos. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadIntercecaoContext(slug)
    if (ctx instanceof Response) return ctx

    const alvos = await getIntercecoesTree(ctx.inquerito.id)
    return Response.json({ alvos })
  } catch (error) {
    return handleApiError(error)
  }
}

/** POST — criar um alvo (suspeito + código). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const body = await req.json().catch(() => null)
    const parsed = intercecaoAlvoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }

    const alvo = await prisma.intercecaoAlvo.create({
      data: {
        nome: parsed.data.nome,
        observacoes: parsed.data.observacoes ?? null,
        notas: parsed.data.notas ?? null,
        acompanhamento: parsed.data.acompanhamento ?? null,
        inqueritoid: ctx.inquerito.id,
      },
    })

    await writeAudit({
      req,
      acao: 'CREATE_INTERCECAO_ALVO',
      entidade: 'IntercecaoAlvo',
      entidadeId: alvo.id,
      utilizadorId: ctx.userId,
      detalhes: { nuipc: ctx.inquerito.nuipc, nome: alvo.nome },
    })

    return Response.json(alvo)
  } catch (error) {
    return handleApiError(error)
  }
}
