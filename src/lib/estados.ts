import { prisma } from '@/lib/prisma'
import { REOPEN_ESTADO_CODIGO } from '@/lib/constants'

export interface EstadoInqueritoOption {
  id: string
  codigo: string
  nome: string
  ordem: number
  terminal: boolean
  cor: string | null
  ativo: boolean
}

const SELECT = {
  id: true,
  codigo: true,
  nome: true,
  ordem: true,
  terminal: true,
  cor: true,
  ativo: true,
} as const

export async function listEstados(opts: { onlyActive?: boolean } = {}) {
  return prisma.estadoInquerito.findMany({
    where: opts.onlyActive ? { ativo: true } : undefined,
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    select: SELECT,
  })
}

export async function findEstadoByCodigo(codigo: string) {
  return prisma.estadoInquerito.findUnique({
    where: { codigo },
    select: SELECT,
  })
}

export async function findEstadoById(id: string) {
  return prisma.estadoInquerito.findUnique({
    where: { id },
    select: SELECT,
  })
}

export async function getReopenEstado() {
  return findEstadoByCodigo(REOPEN_ESTADO_CODIGO)
}

export function makeEstadoMaps(estados: EstadoInqueritoOption[]) {
  const byId = new Map(estados.map((e) => [e.id, e]))
  const byCodigo = new Map(estados.map((e) => [e.codigo, e]))
  return { byId, byCodigo }
}
