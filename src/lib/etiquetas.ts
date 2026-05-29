import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

export interface EtiquetaOption {
  id: string
  nome: string
}

const SELECT = {
  id: true,
  nome: true,
} as const

/** Etiquetas pessoais de um utilizador, por ordem alfabética. */
export async function listEtiquetasByOwner(ownerId: string): Promise<EtiquetaOption[]> {
  return prisma.etiqueta.findMany({
    where: { criadoPorId: ownerId },
    orderBy: { nome: 'asc' },
    select: SELECT,
  })
}

/**
 * Etiquetas em uso em inquéritos dentro de um âmbito (scope) — usado para
 * popular o filtro da listagem. Como as etiquetas "viajam" com o inquérito,
 * mostramos todas as que aparecem em inquéritos visíveis ao utilizador,
 * independentemente de quem as criou.
 */
export async function listEtiquetasEmUso(
  scope: Prisma.InqueritoWhereInput,
): Promise<EtiquetaOption[]> {
  return prisma.etiqueta.findMany({
    where: { inqueritos: { some: { deletedAt: null, ...scope } } },
    orderBy: { nome: 'asc' },
    select: SELECT,
  })
}
