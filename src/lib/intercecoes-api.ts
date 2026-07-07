/**
 * Guarda comum das rotas API de interceções (6 rotas partilham exatamente a
 * mesma cadeia: sessão → módulo ativo → inquérito no scope → gate de escrita).
 * Devolve um `Response` de erro pronto a retornar, ou o contexto carregado.
 * `getSession()` pode lançar (401/503 de manutenção) — as rotas embrulham em
 * try/catch com `handleApiError`, como nas restantes rotas da app.
 */
import { prisma } from '@/lib/prisma'
import { getSession, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { canWorkOnInquerito } from '@/lib/colaboradores'
import { isModuloIntercecoesAtivo } from '@/lib/intercecoes-module'
import { slugToNuipc } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

export interface IntercecaoContext {
  userId: string
  role: Role
  inquerito: { id: string; nuipc: string; inspetorId: string | null; brigadaId: string | null }
}

/**
 * Carrega o contexto de uma rota de interceções. Com `write: true` exige
 * permissão de edição do inquérito (ESTATISTICA nunca escreve).
 */
export async function loadIntercecaoContext(
  slug: string,
  opts: { write?: boolean } = {},
): Promise<IntercecaoContext | Response> {
  const session = await getSession()
  const role = session.user.role as Role
  const brigadaId = session.user.brigadaId ?? null

  if (!(await isModuloIntercecoesAtivo(role))) {
    return apiError('Módulo Interceções desativado', 503)
  }

  const nuipc = slugToNuipc(slug)
  const inquerito = await prisma.inquerito.findFirst({
    where: {
      AND: [{ nuipc }, { deletedAt: null }, buildInqueritoWhere(role, session.user.id, brigadaId)],
    },
    select: { id: true, nuipc: true, inspetorId: true, brigadaId: true },
  })
  if (!inquerito) return apiError('Inquérito não encontrado', 404)

  if (opts.write) {
    // Trabalho operacional: titular, hierarquia, ou colaborador autorizado.
    if (!(await canWorkOnInquerito(role, session.user.id, brigadaId, inquerito))) {
      return apiError('Sem permissão para alterar interceções neste inquérito', 403)
    }
  }

  return { userId: session.user.id, role, inquerito }
}

/** Parse de data "YYYY-MM-DD" (ou ISO); null quando inválida. */
export function parseData(s: string): Date | null {
  const d = new Date(s)
  return Number.isFinite(d.getTime()) ? d : null
}
