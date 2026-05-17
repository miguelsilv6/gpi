import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const { searchParams } = new URL(req.url)
    const unreadOnly = searchParams.get('unread') === 'true'
    const countOnly = searchParams.get('count') === 'true'

    if (countOnly) {
      const count = await prisma.notificacao.count({
        where: { utilizadorId: session.user.id, lida: false },
      })
      return Response.json({ count })
    }

    const cursor = searchParams.get('cursor') ?? undefined
    const limitParam = searchParams.get('limit')
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN
    const PAGE_SIZE = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 50)
      : 20

    const notificacoes = await prisma.notificacao.findMany({
      where: {
        utilizadorId: session.user.id,
        ...(unreadOnly && { lida: false }),
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: { inquerito: { select: { nuipc: true } } },
    })

    const hasMore = notificacoes.length > PAGE_SIZE
    const items = hasMore ? notificacoes.slice(0, PAGE_SIZE) : notificacoes
    const nextCursor = hasMore ? items[items.length - 1].id : null

    return Response.json({ items, nextCursor })
  } catch (error) {
    return handleApiError(error)
  }
}
