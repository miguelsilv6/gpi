import { auth } from '@/auth'
import { hasPermission, type Permission } from '@/lib/rbac'
import type { Role } from '@/generated/prisma/enums'
import type { Prisma } from '@/generated/prisma/client'
import { Prisma as PrismaLib } from '@/generated/prisma/client'

export async function getSession() {
  const session = await auth()
  if (!session?.user) {
    throw new Error('Não autenticado', { cause: 401 })
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

export function buildInqueritoWhere(
  role: Role,
  userId: string,
  brigadaId: string | null,
): Prisma.InqueritoWhereInput {
  if (role === 'INSPETOR') {
    return { inspetorId: userId }
  }
  if (role === 'INSPETOR_CHEFE') {
    // Fail-closed: a chefe without brigada is a misconfiguration. Returning
    // their own inquéritos as a fallback hides the issue and risks silently
    // narrowing/expanding permissions.
    if (!brigadaId) {
      return { id: '__inspetor_chefe_sem_brigada__' }
    }
    return { brigadaId }
  }
  return {}
}

/**
 * Single source of truth for "can this user edit this inquérito?".
 * Use after fetching the inquérito (which gives you the actual brigadaId/inspetorId).
 */
export function canEditInquerito(
  role: Role,
  userId: string,
  userBrigadaId: string | null,
  inq: { inspetorId: string | null; brigadaId: string },
): boolean {
  if (hasPermission(role, 'inquerito:edit:all')) return true
  if (
    role === 'INSPETOR_CHEFE' &&
    userBrigadaId &&
    inq.brigadaId === userBrigadaId &&
    hasPermission(role, 'inquerito:edit:brigade')
  ) {
    return true
  }
  if (
    role === 'INSPETOR' &&
    inq.inspetorId === userId &&
    hasPermission(role, 'inquerito:edit:own')
  ) {
    return true
  }
  return false
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
    return apiError(error.message, status)
  }
  return apiError('Erro interno', 500)
}
