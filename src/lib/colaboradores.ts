/**
 * Colaboração autorizada em inquéritos — um inspetor pode ser autorizado
 * (pelo titular ou pela hierarquia) a trabalhar num inquérito que não lhe
 * está distribuído. Este módulo concentra as regras de "acesso partilhado":
 * o predicado de leitura (usado por `buildInqueritoWhere`) e a verificação
 * de escrita operacional usada pelas rotas (atividades, notas, documentos,
 * controlos, interceções).
 *
 * Âmbito deliberadamente limitado a "trabalho operacional": o colaborador
 * NÃO altera estado/prazo/titular, NÃO apaga o inquérito e NÃO re-delega
 * acesso. Essas ações continuam a exigir `canEditInquerito` / permissões
 * próprias.
 */
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/rbac'
import type { Role } from '@/generated/prisma/enums'

/**
 * Fragmento de where para "colaboração ativa deste utilizador": existe uma
 * linha em InqueritoColaborador para o utilizador cujo prazo ainda não passou
 * (sem prazo = vale sempre). Usado dentro de `colaboradores: { some: ... }`.
 */
export function colaboradorAtivoSomeWhere(
  userId: string,
  now: Date = new Date(),
): Prisma.InqueritoColaboradorWhereInput {
  return {
    colaboradorId: userId,
    OR: [{ expiraEm: null }, { expiraEm: { gt: now } }],
  }
}

/**
 * Verifica (na BD) se o utilizador é colaborador ativo de um inquérito.
 * Usado pelas rotas de escrita operacional para autorizar quem não é o
 * titular nem tem permissão de edição pela hierarquia.
 */
export async function isColaboradorAtivo(
  inqueritoid: string,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const found = await prisma.inqueritoColaborador.findFirst({
    where: {
      inqueritoid,
      ...colaboradorAtivoSomeWhere(userId, now),
    },
    select: { id: true },
  })
  return found !== null
}

/**
 * Pode este utilizador fazer trabalho OPERACIONAL neste inquérito (registar
 * atividades, notas, documentos, controlos, interceções)? Igual à regra
 * histórica — ESTATISTICA nunca; INSPETOR nos seus; CHEFE na sua brigada;
 * COORDENADOR/ADMINISTRACAO em todos — mais o fallback de colaborador ativo,
 * que permite ao inspetor autorizado trabalhar num inquérito que não é seu.
 * NÃO cobre edição de campos core (estado/prazo/titular) nem apagar — essas
 * continuam a exigir `canEditInquerito`.
 */
export async function canWorkOnInquerito(
  role: Role,
  userId: string,
  userBrigadaId: string | null,
  inq: { id: string; inspetorId: string | null; brigadaId: string | null },
): Promise<boolean> {
  if (role === 'ESTATISTICA') return false
  if (role === 'INSPETOR') {
    if (inq.inspetorId === userId) return true
  } else if (role === 'INSPETOR_CHEFE') {
    if (userBrigadaId && inq.brigadaId === userBrigadaId) return true
  } else {
    // COORDENADOR / ADMINISTRACAO
    return true
  }
  return isColaboradorAtivo(inq.id, userId)
}

/**
 * Pode este utilizador conceder/revogar autorizações de colaboração neste
 * inquérito? Regra: o titular (inspetor atribuído) OU a hierarquia com
 * permissão de edição sobre o inquérito (chefe da brigada via edit:brigade,
 * coordenador/administração via edit:all). Um colaborador NÃO pode re-delegar.
 */
export function canManageColaboradores(
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
  // O titular do inquérito (mesmo sendo INSPETOR) gere os seus colaboradores.
  if (inq.inspetorId === userId) return true
  return false
}
