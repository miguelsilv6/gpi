import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import type { Role } from '@/generated/prisma/enums'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:read:own')) return apiError('Sem permissão', 403)

    const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
    if (q.length < 1) return Response.json([])

    const scopeWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId ?? null)

    const results = await prisma.inquerito.findMany({
      where: {
        AND: [
          scopeWhere,
          { deletedAt: null },
          { nuipc: { contains: q.toUpperCase(), mode: 'insensitive' } },
        ],
      },
      orderBy: { nuipc: 'asc' },
      take: 10,
      select: { id: true, nuipc: true },
    })

    return Response.json(results)
  } catch (error) {
    return handleApiError(error)
  }
}
