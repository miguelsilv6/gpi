import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

/**
 * Lista paginada de atualizações passadas. Query: ?limit=20&before=<startedAt>
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão', 403)
    }

    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 100)
    const beforeRaw = url.searchParams.get('before')
    const before = beforeRaw ? new Date(beforeRaw) : null

    const rows = await prisma.atualizacaoSistema.findMany({
      where: before ? { startedAt: { lt: before } } : {},
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { iniciadoPor: { select: { id: true, nome: true } } },
    })

    return Response.json({
      items: rows.map((r) => ({
        id: r.id,
        requestId: r.requestId,
        fromVersion: r.fromVersion,
        toVersion: r.toVersion,
        state: r.state,
        preBackupFile: r.preBackupFile,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        durationMs:
          r.finishedAt && r.startedAt
            ? r.finishedAt.getTime() - r.startedAt.getTime()
            : null,
        errorMessage: r.errorMessage,
        rolledBack: r.rolledBack,
        iniciadoPor: r.iniciadoPor.nome,
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
