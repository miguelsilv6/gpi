/**
 * Helpers PUROS para scope-locking por role. Sem imports de NextAuth ou
 * Prisma Client — só os tipos. Isolados num módulo separado para serem
 * testáveis em isolamento (vitest sem dependências de runtime).
 *
 * O `auth-helpers.ts` faz re-export destas funções para manter o single
 * import-site para o resto do codebase.
 */

import type { Role } from '@/generated/prisma/enums'
import type { Prisma } from '@/generated/prisma/client'
import { hasPermission } from '@/lib/rbac'

/**
 * Atividade where-clause scoped by role for the /prazos page.
 *   INSPETOR        → atividades que ele próprio criou
 *   INSPETOR_CHEFE  → atividades em inquéritos da sua brigada
 *   COORDENADOR/ADMIN → todas
 * Fail-closed para INSPETOR_CHEFE sem brigada (configuração inválida).
 */
export function buildAtividadePrazoWhere(
  role: Role,
  userId: string,
  brigadaId: string | null,
): Prisma.AtividadeWhereInput {
  if (role === 'INSPETOR') {
    return { utilizadorId: userId }
  }
  if (role === 'INSPETOR_CHEFE') {
    if (!brigadaId) {
      return { id: '__inspetor_chefe_sem_brigada__' }
    }
    return { inquerito: { brigadaId } }
  }
  return {}
}

/**
 * Controlo where-clause scoped by role for the /prazos page.
 *   INSPETOR        → controlos que ele criou
 *   INSPETOR_CHEFE  → controlos seus + controlos de inquéritos da brigada
 *   COORDENADOR/ADMIN → todos
 */
export function buildControloWhere(
  role: Role,
  userId: string,
  brigadaId: string | null,
): Prisma.ControloWhereInput {
  if (role === 'INSPETOR') {
    return { criadorId: userId }
  }
  if (role === 'INSPETOR_CHEFE') {
    if (!brigadaId) {
      return { id: '__inspetor_chefe_sem_brigada__' }
    }
    return {
      OR: [
        { criadorId: userId },
        { inquerito: { brigadaId } },
      ],
    }
  }
  return {}
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
    // Fail-closed: chefe sem brigada é um misconfig. Devolver os próprios
    // inquéritos como fallback esconde o problema e arrisca alargar/encurtar
    // silenciosamente as permissões.
    if (!brigadaId) {
      return { id: '__inspetor_chefe_sem_brigada__' }
    }
    return { brigadaId }
  }
  return {}
}

/**
 * Single source of truth para "pode este utilizador editar este inquérito?".
 * Usa-se após obter o inquérito (para conhecer o brigadaId/inspetorId reais).
 */
export function canEditInquerito(
  role: Role,
  userId: string,
  userBrigadaId: string | null,
  inq: { inspetorId: string | null; brigadaId: string | null },
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
