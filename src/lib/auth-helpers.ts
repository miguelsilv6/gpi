import { auth } from '@/auth'
import { hasPermission, type Permission } from '@/lib/rbac'
import type { Role } from '@/generated/prisma/enums'
import { Prisma as PrismaLib } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

// Re-export dos helpers de scope. A implementação vive em role-scope.ts
// (sem dependência de NextAuth) para ser testável em isolamento. Os
// call-sites continuam a importar de '@/lib/auth-helpers'.
export {
  buildAtividadePrazoWhere,
  buildInqueritoWhere,
  buildControloWhere,
  canEditInquerito,
  getInqueritoColumnsVisibility,
} from '@/lib/role-scope'

export async function getSession() {
  const session = await auth()
  if (!session?.user) {
    throw new Error('Não autenticado', { cause: 401 })
  }

  // Maintenance-mode gate — bloqueia escritas/leituras pela API a quem não é
  // ADMINISTRACAO enquanto o sistema está em manutenção (e.g. durante um
  // restauro). O admin que activou o modo continua a poder operar pelo UI
  // para o desligar.
  if ((session.user.role as Role) !== 'ADMINISTRACAO') {
    const config = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { maintenanceMode: true },
    })
    if (config?.maintenanceMode) {
      throw new Error('Sistema em manutenção', { cause: 503 })
    }
  }

  return session
}

export async function checkPermission(permission: Permission) {
  const session = await getSession()
  if (!hasPermission(session.user.role as Role, permission)) {
    throw new Error('Sem permissão', { cause: 403 })
  }
  return session
}

export function apiError(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

export function handleApiError(error: unknown) {
  // Prisma unique constraint violation → 409 Conflict
  if (error instanceof PrismaLib.PrismaClientKnownRequestError && error.code === 'P2002') {
    return apiError('Registo duplicado — verifique os campos únicos', 409)
  }
  if (error instanceof Error) {
    const status = (error.cause as number) || 500
    if (status === 401) return apiError('Não autenticado', 401)
    if (status === 403) return apiError('Sem permissão', 403)
    // Never forward raw exception messages for 5xx — they may contain internal details.
    if (status >= 500) return apiError('Erro interno', 500)
    return apiError(error.message, status)
  }
  return apiError('Erro interno', 500)
}
