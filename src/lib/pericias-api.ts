/**
 * Guarda comum das rotas de perícias: sessão → módulo ativo → inquérito no
 * scope → gate de escrita operacional (canWorkOnInquerito — inclui colaborador
 * autorizado, como as apreensões/interceções). Devolve `Response` de erro
 * pronto ou o contexto carregado.
 */
import { prisma } from '@/lib/prisma'
import { getSession, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { canWorkOnInquerito } from '@/lib/colaboradores'
import { isModuloPericiasAtivo } from '@/lib/pericias-module'
import { slugToNuipc } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

export interface PericiaContext {
  userId: string
  role: Role
  canWork: boolean
  inquerito: { id: string; nuipc: string; inspetorId: string | null; brigadaId: string | null }
}

export async function loadPericiaContext(
  slug: string,
  opts: { write?: boolean } = {},
): Promise<PericiaContext | Response> {
  const session = await getSession()
  const role = session.user.role as Role
  const brigadaId = session.user.brigadaId ?? null

  if (!(await isModuloPericiasAtivo(role))) {
    return apiError('Módulo Perícias desativado', 503)
  }

  const nuipc = slugToNuipc(slug)
  const inquerito = await prisma.inquerito.findFirst({
    where: {
      AND: [{ nuipc }, { deletedAt: null }, buildInqueritoWhere(role, session.user.id, brigadaId)],
    },
    select: { id: true, nuipc: true, inspetorId: true, brigadaId: true },
  })
  if (!inquerito) return apiError('Inquérito não encontrado', 404)

  const canWork = await canWorkOnInquerito(role, session.user.id, brigadaId, inquerito)
  if (opts.write && !canWork) {
    return apiError('Sem permissão para alterar perícias neste inquérito', 403)
  }

  return { userId: session.user.id, role, canWork, inquerito }
}

/** Converte string "YYYY-MM-DD"/ISO em Date; null quando inválida/vazia. */
export function parsePericiaData(s: string | undefined | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isFinite(d.getTime()) ? d : null
}

/**
 * Valida a ligação opcional a um objeto apreendido: se `apreensaoId` for dado,
 * tem de pertencer ao mesmo inquérito. Devolve o id validado (ou null).
 */
export async function resolveApreensaoLink(
  apreensaoId: string | undefined | null,
  inqueritoid: string,
): Promise<string | null | 'invalid'> {
  if (!apreensaoId) return null
  const apr = await prisma.apreensao.findFirst({
    where: { id: apreensaoId, inqueritoid },
    select: { id: true },
  })
  return apr ? apr.id : 'invalid'
}
