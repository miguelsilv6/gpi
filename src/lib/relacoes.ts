/**
 * Leitura das ligações entre inquéritos (apensos/conexões).
 *
 * Cada ligação é guardada uma vez (origem→destino) mas é SIMÉTRICA: ao listar
 * as ligações de um inquérito procuramos nos dois sentidos e devolvemos sempre
 * o "outro" inquérito do par. O âmbito por role é aplicado pelo Prisma
 * (buildInqueritoWhere) — só se mostram inquéritos relacionados que o
 * utilizador pode efetivamente ler.
 */
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere } from '@/lib/role-scope'
import { nuipcToSlug } from '@/lib/utils'
import type { Role, TipoRelacaoInquerito } from '@/generated/prisma/enums'

export interface RelacaoView {
  relacaoId: string
  tipo: TipoRelacaoInquerito
  nota: string | null
  inquerito: {
    id: string
    nuipc: string
    slug: string
    crimeNome: string
    estadoNome: string
  }
}

const OTHER_SELECT = {
  id: true,
  nuipc: true,
  natureza: true,
  crime: { select: { nome: true } },
  estado: { select: { nome: true } },
} as const

export async function getRelacoesForInquerito(
  inqId: string,
  role: Role,
  userId: string,
  brigadaId: string | null,
): Promise<RelacaoView[]> {
  const relacoes = await prisma.inqueritoRelacao.findMany({
    where: { OR: [{ origemId: inqId }, { destinoId: inqId }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      tipo: true,
      nota: true,
      origemId: true,
      destinoId: true,
      origem: { select: OTHER_SELECT },
      destino: { select: OTHER_SELECT },
    },
  })

  const pairs = relacoes.map((r) => ({
    relacaoId: r.id,
    tipo: r.tipo,
    nota: r.nota,
    other: r.origemId === inqId ? r.destino : r.origem,
  }))

  const otherIds = [...new Set(pairs.map((p) => p.other.id))]
  if (otherIds.length === 0) return []

  // Filtra ao âmbito do utilizador: um inquérito relacionado de outra brigada
  // (fora do scope) não é revelado.
  const readableRows = await prisma.inquerito.findMany({
    where: {
      AND: [
        { id: { in: otherIds } },
        { deletedAt: null },
        buildInqueritoWhere(role, userId, brigadaId),
      ],
    },
    select: { id: true },
  })
  const readable = new Set(readableRows.map((r) => r.id))

  return pairs
    .filter((p) => readable.has(p.other.id))
    .map((p) => ({
      relacaoId: p.relacaoId,
      tipo: p.tipo,
      nota: p.nota,
      inquerito: {
        id: p.other.id,
        nuipc: p.other.nuipc,
        slug: nuipcToSlug(p.other.nuipc),
        crimeNome: p.other.crime?.nome ?? p.other.natureza,
        estadoNome: p.other.estado.nome,
      },
    }))
}
