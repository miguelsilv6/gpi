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
 * Atividade where-clause scoped for the /prazos page.
 * Prazos são sempre privados — cada inspetor só vê os seus próprios.
 */
export function buildAtividadePrazoWhere(
  _role: Role,
  userId: string,
  _brigadaId: string | null,
): Prisma.AtividadeWhereInput {
  return { utilizadorId: userId }
}

/**
 * Controlo where-clause scoped for the /prazos page.
 * Controlos são sempre privados — cada inspetor só vê os que criou.
 */
export function buildControloWhere(
  _role: Role,
  userId: string,
  _brigadaId: string | null,
): Prisma.ControloWhereInput {
  return { criadorId: userId }
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
 * Single source of truth para a visibilidade de colunas na lista de
 * inquéritos (tabela, cartões mobile e export CSV). INSPETOR: Inspetor é
 * redundante (é sempre o próprio) — mostra Denunciante em vez disso.
 * INSPETOR_CHEFE: mostra Denunciante a mais, sem coluna de Prazo.
 */
export function getInqueritoColumnsVisibility(role: Role): {
  showInspetor: boolean
  showDenunciante: boolean
  showPrazo: boolean
} {
  return {
    showInspetor: role !== 'INSPETOR',
    showDenunciante: role === 'INSPETOR' || role === 'INSPETOR_CHEFE',
    showPrazo: role !== 'INSPETOR_CHEFE',
  }
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
