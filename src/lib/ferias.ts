import { getPortugueseHolidays } from '@/lib/ajudas-calc'
import type { TipoAusencia } from '@/generated/prisma/enums'

// Cache the holiday Set per calendar year so a multi-year range (Dec→Jan) only
// computes the (somewhat expensive) Easter-based set once per year.
const holidayCache = new Map<number, Set<string>>()
function holidaysFor(year: number): Set<string> {
  let set = holidayCache.get(year)
  if (!set) {
    set = getPortugueseHolidays(year)
    holidayCache.set(year, set)
  }
  return set
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local-date key 'YYYY-MM-DD' — matches the format used by getPortugueseHolidays. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A working day = not Saturday/Sunday and not a Portuguese public holiday. */
export function isWorkingDay(d: Date): boolean {
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return false
  return !holidaysFor(d.getFullYear()).has(dayKey(d))
}

/**
 * Counts working days in the inclusive range [inicio, fim], excluding weekends
 * and Portuguese public holidays. Dates are treated as date-only (local).
 * Returns 0 if fim < inicio.
 */
export function countWorkingDays(inicio: Date, fim: Date): number {
  // Dates from the DB are UTC instants — read the calendar day in UTC so the
  // count is independent of the server timezone, then iterate in local time.
  const start = new Date(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate())
  const end = new Date(fim.getUTCFullYear(), fim.getUTCMonth(), fim.getUTCDate())
  if (end < start) return 0

  let count = 0
  const cursor = new Date(start)
  while (cursor <= end) {
    if (isWorkingDay(cursor)) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

interface AusenciaLike {
  tipo: TipoAusencia
  dataInicio: Date | string
  dataFim: Date | string
}

/**
 * Splits the working-day totals by tipo across a list of ausências. When `ano`
 * is provided, each range is clamped to that calendar year so a Dec→Jan range
 * only contributes its in-year working days (avoids cross-year double counting).
 */
export function countByTipo(
  ausencias: AusenciaLike[],
  ano?: number,
): { ferias: number; folga: number; total: number } {
  let ferias = 0
  let folga = 0

  const yearStart = ano != null ? new Date(Date.UTC(ano, 0, 1)) : null
  const yearEnd = ano != null ? new Date(Date.UTC(ano, 11, 31)) : null

  for (const a of ausencias) {
    let inicio = new Date(a.dataInicio)
    let fim = new Date(a.dataFim)
    if (yearStart && inicio < yearStart) inicio = yearStart
    if (yearEnd && fim > yearEnd) fim = yearEnd

    const dias = countWorkingDays(inicio, fim)
    if (a.tipo === 'FERIAS') ferias += dias
    else folga += dias
  }

  return { ferias, folga, total: ferias + folga }
}
