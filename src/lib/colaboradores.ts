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
import { applyPolicy } from '@/lib/notifications'
import { formatDate } from '@/lib/utils'
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

/**
 * Decisão de mutação de uma atividade, dadas as relações já resolvidas
 * (função pura — o acesso à BD, ex.: `isColaboradorAtivo`, é feito pela rota).
 *
 * Distingue dois níveis, para espelhar exatamente a UI do detalhe:
 *  - `canWork`  → pode CONCLUIR a atividade (marcar devolução/exame/prazo).
 *    É trabalho operacional: titular, hierarquia da brigada, ou colaborador
 *    ativo. Qualquer um destes conclui atividades de qualquer autor.
 *  - `canEditEntry` → pode EDITAR os metadados ou ELIMINAR a entrada. Para o
 *    INSPETOR isto exige ser o autor da atividade (cada inspetor gere as suas);
 *    a hierarquia (chefe da brigada, coordenação, administração) pode sempre.
 *
 * Antes da colaboração, todas as atividades de um inquérito eram do titular,
 * pelo que o gate antigo (`autor === utilizador && titular === utilizador`)
 * bastava. Com autoria mista (colaboradores), esse gate negava — indevidamente
 * — a edição/conclusão pelo próprio colaborador das SUAS atividades e a
 * conclusão pelo titular das atividades registadas por outros.
 */
export function atividadeMutationAccess(
  role: Role,
  rel: {
    isCreator: boolean
    isTitular: boolean
    isColaboradorAtivo: boolean
    inBrigada: boolean
  },
): { canWork: boolean; canEditEntry: boolean } {
  if (role === 'ESTATISTICA') return { canWork: false, canEditEntry: false }
  if (role === 'COORDENADOR' || role === 'ADMINISTRACAO') {
    return { canWork: true, canEditEntry: true }
  }
  if (role === 'INSPETOR_CHEFE') {
    return { canWork: rel.inBrigada, canEditEntry: rel.inBrigada }
  }
  // INSPETOR: trabalha o inquérito se for titular ou colaborador ativo; só
  // edita/elimina as atividades de que é autor.
  const canWork = rel.isTitular || rel.isColaboradorAtivo
  return { canWork, canEditEntry: canWork && rel.isCreator }
}

/**
 * Notifica (in-app/email, conforme a policy) o inspetor que acabou de ser
 * autorizado a colaborar num inquérito — deve saber que passou a ter acesso.
 * Tolerante a falhas: um erro a notificar nunca deve fazer falhar a concessão.
 */
export async function notifyColaboracaoAutorizada(params: {
  inqueritoid: string
  nuipc: string
  colaboradorId: string
  expiraEm: Date | null
  motivo: string | null
}): Promise<void> {
  const { inqueritoid, nuipc, colaboradorId, expiraEm, motivo } = params
  await applyPolicy({
    tipo: 'COLABORACAO_AUTORIZADA',
    titulo: `Colaboração autorizada — ${nuipc}`,
    mensagem:
      `Foi autorizado a colaborar no inquérito ${nuipc}. ` +
      `Pode registar trabalho operacional (atividades, notas, documentos, controlos e interceções).` +
      (expiraEm ? ` Autorização válida até ${formatDate(expiraEm)}.` : '') +
      (motivo ? ` Motivo: ${motivo}.` : ''),
    inqueritoid,
    naturalUserId: colaboradorId,
  }).catch(() => {})
}
