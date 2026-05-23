import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { startUpdate } from '@/lib/updates/orchestrator'
import { parseSemver } from '@/lib/updates/github'
import type { Role } from '@/generated/prisma/enums'

/**
 * Inicia o fluxo de auto-atualização. Após esta request voltar 202, o
 * cliente passa a fazer polling a /api/updates/status.
 *
 * Body: { targetTag: string }
 * Header opcional: Idempotency-Key (UUID v4). Sem ela é gerada server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão para iniciar atualizações', 403)
    }

    const body = (await req.json().catch(() => ({}))) as { targetTag?: unknown }
    const targetTag = typeof body.targetTag === 'string' ? body.targetTag.trim() : ''
    if (!targetTag) return apiError('targetTag em falta', 400)
    if (!parseSemver(targetTag)) return apiError('targetTag não é semver', 400)

    const idempotencyKey = req.headers.get('Idempotency-Key') ?? undefined

    const result = await startUpdate({
      targetTag,
      requestId: idempotencyKey,
      userId: session.user.id,
    })

    return Response.json({ id: result.id, alreadyRunning: result.alreadyRunning ?? false }, {
      status: result.alreadyRunning ? 409 : 202,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
