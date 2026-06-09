/**
 * Helpers for the Controlos panel on /prazos.
 */

import { diasRestantes, type Urgency } from '@/lib/prazos'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ControloRealizacaoItem {
  id: string
  numero: number
  dataEsperada: Date | string
  dataRealizacao: Date | string | null
  observacoes: string | null
  alertaEnviado: boolean
  realizadoPor: { id: string; nome: string } | null
}

export interface ControloItem {
  id: string
  descricao: string
  observacoes: string | null
  dataInicio: Date | string
  periodoDias: number | null
  alertaDias: number
  concluidoEm: Date | string | null
  criador: { id: string; nome: string }
  inquerito: {
    id: string
    nuipc: string
    brigada: { id: string; nome: string } | null
    estado: { id: string; codigo: string; nome: string; cor: string | null; terminal: boolean }
  } | null
  realizacoes: ControloRealizacaoItem[]
}

// ─── Prisma SELECT shape ──────────────────────────────────────────────────────

export const CONTROLO_SELECT = {
  id: true,
  descricao: true,
  observacoes: true,
  dataInicio: true,
  periodoDias: true,
  alertaDias: true,
  concluidoEm: true,
  criador: { select: { id: true, nome: true } },
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
  realizacoes: {
    orderBy: { numero: 'asc' as const },
    select: {
      id: true,
      numero: true,
      dataEsperada: true,
      dataRealizacao: true,
      observacoes: true,
      alertaEnviado: true,
      realizadoPor: { select: { id: true, nome: true } },
    },
  },
} as const

// ─── Urgency helpers ──────────────────────────────────────────────────────────

/** Next pending realizacao for a controlo (lowest numero without dataRealizacao). */
export function nextRealizacao(
  realizacoes: ControloRealizacaoItem[],
): ControloRealizacaoItem | null {
  return realizacoes.find((r) => !r.dataRealizacao) ?? null
}

/** How many realizacoes have been confirmed. */
export function countConfirmadas(realizacoes: ControloRealizacaoItem[]): number {
  return realizacoes.filter((r) => !!r.dataRealizacao).length
}

/** Urgency of the next pending realizacao. */
export function urgencyControlo(
  controlo: Pick<ControloItem, 'alertaDias'>,
  next: ControloRealizacaoItem | null,
  now: Date = new Date(),
): Urgency {
  if (!next) return 'ok'
  const date = typeof next.dataEsperada === 'string' ? new Date(next.dataEsperada) : next.dataEsperada
  const days = diasRestantes(date, now)
  if (days < 0) return 'overdue'
  if (days <= controlo.alertaDias) return 'urgent'
  if (days <= 30) return 'soon'
  return 'ok'
}

/** Format the ordinal label for a control number (pt-PT). */
export function ordinalControlo(numero: number): string {
  return `${numero}.º Controlo`
}
