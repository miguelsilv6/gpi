import type { SeveridadeBug, EstadoBug } from '@/generated/prisma/enums'

export const SEVERIDADE_LABELS: Record<SeveridadeBug, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
}

export const SEVERIDADE_COLORS: Record<SeveridadeBug, string> = {
  BAIXA: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  MEDIA: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ALTA: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  CRITICA: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

export const ESTADO_LABELS: Record<EstadoBug, string> = {
  ABERTO: 'Aberto',
  EM_ANALISE: 'Em análise',
  RESOLVIDO: 'Resolvido',
  REJEITADO: 'Rejeitado',
}

export const ESTADO_COLORS: Record<EstadoBug, string> = {
  ABERTO: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  EM_ANALISE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  RESOLVIDO: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  REJEITADO: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

export const SEVERIDADE_VALUES: SeveridadeBug[] = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']
export const ESTADO_VALUES: EstadoBug[] = ['ABERTO', 'EM_ANALISE', 'RESOLVIDO', 'REJEITADO']

/**
 * Máquina de estados dos bug reports. ABERTO tem de passar por EM_ANALISE
 * antes de RESOLVIDO; estados terminais só reabrem para ABERTO/EM_ANALISE.
 */
export const ESTADO_TRANSICOES: Record<EstadoBug, EstadoBug[]> = {
  ABERTO:     ['EM_ANALISE', 'REJEITADO'],
  EM_ANALISE: ['ABERTO', 'RESOLVIDO', 'REJEITADO'],
  RESOLVIDO:  ['ABERTO', 'EM_ANALISE'],
  REJEITADO:  ['ABERTO', 'EM_ANALISE'],
}

export function isTransicaoEstadoValida(from: EstadoBug, to: EstadoBug): boolean {
  if (from === to) return true
  return ESTADO_TRANSICOES[from]?.includes(to) ?? false
}
