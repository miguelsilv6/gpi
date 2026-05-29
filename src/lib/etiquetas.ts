import { prisma } from '@/lib/prisma'

export interface EtiquetaOption {
  id: string
  nome: string
  descricao: string | null
  cor: string | null
  ordem: number
  ativo: boolean
}

const SELECT = {
  id: true,
  nome: true,
  descricao: true,
  cor: true,
  ordem: true,
  ativo: true,
} as const

export async function listEtiquetas(opts: { onlyActive?: boolean } = {}) {
  return prisma.etiqueta.findMany({
    where: opts.onlyActive ? { ativo: true } : undefined,
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: SELECT,
  })
}

export async function findEtiquetaById(id: string) {
  return prisma.etiqueta.findUnique({
    where: { id },
    select: SELECT,
  })
}
