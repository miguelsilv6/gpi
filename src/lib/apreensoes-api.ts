/**
 * Guarda comum das rotas de apreensões: sessão → módulo ativo → inquérito no
 * scope → gate de escrita operacional (canWorkOnInquerito — inclui colaborador
 * autorizado, como as atividades/interceções). Devolve `Response` de erro
 * pronto ou o contexto carregado.
 */
import { prisma } from '@/lib/prisma'
import { getSession, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { canWorkOnInquerito } from '@/lib/colaboradores'
import { isModuloApreensoesAtivo } from '@/lib/apreensoes-module'
import { slugToNuipc } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

export interface ApreensaoContext {
  userId: string
  role: Role
  canWork: boolean
  inquerito: { id: string; nuipc: string; inspetorId: string | null; brigadaId: string | null }
}

export async function loadApreensaoContext(
  slug: string,
  opts: { write?: boolean } = {},
): Promise<ApreensaoContext | Response> {
  const session = await getSession()
  const role = session.user.role as Role
  const brigadaId = session.user.brigadaId ?? null

  if (!(await isModuloApreensoesAtivo(role))) {
    return apiError('Módulo Apreensões desativado', 503)
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
    return apiError('Sem permissão para alterar apreensões neste inquérito', 403)
  }

  return { userId: session.user.id, role, canWork, inquerito }
}

/** Converte string "YYYY-MM-DD"/ISO em Date; null quando inválida. */
export function parseApreensaoData(s: string | undefined | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isFinite(d.getTime()) ? d : null
}
