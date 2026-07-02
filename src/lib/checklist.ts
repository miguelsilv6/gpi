/**
 * Checklist por tipo de crime — as atividades-padrão esperadas num inquérito
 * de um dado crime. A completude NÃO guarda estado próprio: um item está
 * "feito" quando o inquérito tem pelo menos uma atividade registada com o
 * nome desse padrão. Sem estado duplicado, sem drift — apagar/registar
 * atividades reflete-se de imediato na checklist.
 */
import { prisma } from '@/lib/prisma'

export interface ChecklistItemView {
  atividadePadraoId: string
  nome: string
  done: boolean
  /** Nº de atividades registadas com este nome (informativo). */
  count: number
}

export interface ChecklistView {
  items: ChecklistItemView[]
  done: number
  total: number
}

/**
 * Função PURA: cruza os itens esperados com os nomes das atividades já
 * registadas. `atividadeCounts` é um mapa nome → nº de registos.
 */
export function computeChecklist(
  itens: { atividadePadraoId: string; nome: string }[],
  atividadeCounts: Map<string, number>,
): ChecklistView {
  const items = itens.map((i) => {
    const count = atividadeCounts.get(i.nome) ?? 0
    return { atividadePadraoId: i.atividadePadraoId, nome: i.nome, done: count > 0, count }
  })
  return { items, done: items.filter((i) => i.done).length, total: items.length }
}

/** Itens de checklist configurados para um crime (ordenados). */
export async function getChecklistItens(crimeId: string) {
  const rows = await prisma.crimeChecklistItem.findMany({
    where: { crimeId },
    orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
    select: {
      atividadePadraoId: true,
      atividadePadrao: { select: { nome: true } },
    },
  })
  return rows.map((r) => ({ atividadePadraoId: r.atividadePadraoId, nome: r.atividadePadrao.nome }))
}

/**
 * Checklist calculada para um inquérito. Devolve null quando o crime não tem
 * checklist configurada (a UI não mostra nada nesse caso).
 */
export async function getChecklistForInquerito(
  crimeId: string | null,
  inqueritoId: string,
): Promise<ChecklistView | null> {
  if (!crimeId) return null
  const itens = await getChecklistItens(crimeId)
  if (itens.length === 0) return null

  const registadas = await prisma.atividade.groupBy({
    by: ['descricao'],
    where: { inqueritoid: inqueritoId, descricao: { in: itens.map((i) => i.nome) } },
    _count: { _all: true },
  })
  const counts = new Map(registadas.map((r) => [r.descricao, r._count._all]))
  return computeChecklist(itens, counts)
}
