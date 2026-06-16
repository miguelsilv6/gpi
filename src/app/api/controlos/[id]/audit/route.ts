import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import type { Role } from '@/generated/prisma/enums'

/**
 * Histórico de auditoria de UM controlo: alterações ao próprio controlo
 * (criação, edição, conclusão/reativação, eliminação) e confirmações das suas
 * realizações. Usado pelo botão "Histórico" na lista de controlos.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { id } = await params

    // Carrega o controlo e valida acesso de leitura (mesmas regras da edição).
    const controlo = await prisma.controlo.findUnique({
      where: { id },
      select: {
        id: true,
        criadorId: true,
        realizacoes: { select: { id: true } },
      },
    })
    if (!controlo) return apiError('Controlo não encontrado', 404)

    const canRead =
      controlo.criadorId === session.user.id ||
      hasPermission(role, 'controlo:read:all')
    if (!canRead) return apiError('Sem permissão', 403)

    const realizacaoIds = controlo.realizacoes.map((r) => r.id)

    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entidade: 'Controlo', entidadeId: id },
          ...(realizacaoIds.length
            ? [{ entidade: 'ControloRealizacao', entidadeId: { in: realizacaoIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    // Hidratar nomes dos utilizadores numa só query.
    const userIds = Array.from(new Set(logs.map((l) => l.utilizadorId)))
    const users = userIds.length
      ? await prisma.utilizador.findMany({
          where: { id: { in: userIds } },
          select: { id: true, nome: true },
        })
      : []
    const nameById = new Map(users.map((u) => [u.id, u.nome]))

    return Response.json({
      data: logs.map((l) => ({ ...l, utilizadorNome: nameById.get(l.utilizadorId) ?? null })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
