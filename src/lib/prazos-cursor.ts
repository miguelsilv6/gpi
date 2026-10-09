/**
 * Paginação por cursor (keyset) da lista /prazos quando se misturam duas fontes
 * — atividades (rank 0) e fins de interceção (rank 1) — ordenadas por
 * (data, rank, id). Evita carregar `página × tamanho` linhas de cada fonte.
 *
 * O cursor identifica o ÚLTIMO item da página anterior e serializa-se como
 * `<ISO>_<rank>_<id>` para ir no URL.
 */

export type FonteRank = 0 | 1

export interface PrazoCursor {
  date: Date
  rank: FonteRank
  id: string
}

export function formatCursor(c: PrazoCursor): string {
  return `${c.date.toISOString()}_${c.rank}_${c.id}`
}

export function parseCursor(raw: string | null | undefined): PrazoCursor | null {
  if (!raw) return null
  const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)_([01])_([A-Za-z0-9_-]+)$/.exec(raw)
  if (!m) return null
  const date = new Date(m[1])
  if (!Number.isFinite(date.getTime())) return null
  return { date, rank: Number(m[2]) as FonteRank, id: m[3] }
}

/** Ordem total (data, rank, id) usada para fundir as duas fontes. */
export function compareCursor(a: PrazoCursor, b: PrazoCursor): number {
  const t = a.date.getTime() - b.date.getTime()
  if (t !== 0) return t
  if (a.rank !== b.rank) return a.rank - b.rank
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Filtro Prisma "estritamente depois do cursor" para a fonte de rank `rank`,
 * sobre o campo de data `campo`.
 */
export function afterCursorWhere<K extends string>(
  campo: K,
  rank: FonteRank,
  cursor: PrazoCursor | null,
):
  | Record<string, never>
  | { [P in K]: { gt: Date } | { gte: Date } }
  | { OR: ({ [P in K]: { gt: Date } } | ({ [P in K]: Date } & { id: { gt: string } }))[] } {
  if (!cursor) return {}
  if (rank < cursor.rank) return { [campo]: { gt: cursor.date } } as { [P in K]: { gt: Date } }
  if (rank > cursor.rank) return { [campo]: { gte: cursor.date } } as { [P in K]: { gte: Date } }
  return {
    OR: [
      { [campo]: { gt: cursor.date } } as { [P in K]: { gt: Date } },
      { [campo]: cursor.date, id: { gt: cursor.id } } as { [P in K]: Date } & { id: { gt: string } },
    ],
  }
}

/** Histórico de cursores (para "Anterior"): '-' representa o início. */
export function parseHistorico(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split('~').filter(Boolean).slice(0, 200)
}
