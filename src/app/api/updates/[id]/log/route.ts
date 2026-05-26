import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { getUpdateLog } from '@/lib/updates/orchestrator'
import type { Role } from '@/generated/prisma/enums'

/**
 * Registo cronológico de um update (qualquer um do histórico). Usado pelo
 * diálogo "Ver registo" na tab de Atualizações.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão', 403)
    }
    const { id } = await ctx.params
    const items = await getUpdateLog(id)
    return Response.json({ items })
  } catch (error) {
    return handleApiError(error)
  }
}
