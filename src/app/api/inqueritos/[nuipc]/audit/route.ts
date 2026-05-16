import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSession,
  buildInqueritoWhere,
  handleApiError,
  apiError,
} from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { slugToNuipc } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:audit:read')) {
      return apiError('Sem permissão', 403)
    }

    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)
    const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)

    const inquerito = await prisma.inquerito.findFirst({
      where: { nuipc, ...roleWhere },
      select: { id: true },
    })
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    const { searchParams } = req.nextUrl
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))

    const logs = await prisma.auditLog.findMany({
      where: { entidade: 'Inquerito', entidadeId: inquerito.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Hydrate utilizador names in one go
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
