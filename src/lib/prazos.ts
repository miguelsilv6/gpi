/**
 * Helpers for the /prazos page.
 *
 * Centralizes urgency computation and the standard Prisma select shape so the
 * server page, list view, and calendar view stay in sync.
 */

export type Urgency = 'overdue' | 'urgent' | 'soon' | 'ok'

/** Floor to midnight in local time. */
function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Whole days between today and the deadline (negative if overdue). */
export function diasRestantes(dataPrazo: Date, now: Date = new Date()): number {
  const a = startOfDay(now).getTime()
  const b = startOfDay(new Date(dataPrazo)).getTime()
  return Math.round((b - a) / 86_400_000)
}

/**
 * Classify a deadline.
 *  - overdue: before today
 *  - urgent:  within `alertaDias` days (system default 7)
 *  - soon:    within 30 days
 *  - ok:      further away
 */
export function urgencyFor(
  dataPrazo: Date,
  alertaDias: number,
  now: Date = new Date(),
): Urgency {
  const days = diasRestantes(dataPrazo, now)
  if (days < 0) return 'overdue'
  if (days <= alertaDias) return 'urgent'
  if (days <= 30) return 'soon'
  return 'ok'
}

/** Reusable Prisma select shape for an Atividade with all the data the page needs. */
export const ATIVIDADE_PRAZO_SELECT = {
  id: true,
  descricao: true,
  observacoes: true,
  quantidade: true,
  dataPrazo: true,
  dataRealizacao: true,
  alertaDias1: true,
  alertaDias2: true,
  alerta1Enviado: true,
  alerta2Enviado: true,
  concluidaEm: true,
  realizadaPor: { select: { id: true, nome: true } },
  inquerito: {
    select: {
      id: true,
      nuipc: true,
      brigada: { select: { id: true, nome: true } },
      estado: {
        select: { id: true, codigo: true, nome: true, cor: true, terminal: true },
      },
    },
  },
} as const

/** First day of a month (local time). `month` format: YYYY-MM. */
export function startOfMonth(month: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(y, m - 1, 1, 0, 0, 0, 0)
}

/** Exclusive end (first day of NEXT month). */
export function endOfMonthExclusive(month: string): Date | null {
  const start = startOfMonth(month)
  if (!start) return null
  return new Date(start.getFullYear(), start.getMonth() + 1, 1, 0, 0, 0, 0)
}

/** Format month label, e.g. `2026-05` → `2026-05`. Keep it simple/locale-stable for URLs. */
export function formatMonthParam(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function formatDayParam(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
