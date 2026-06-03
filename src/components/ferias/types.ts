export type TipoAusencia = 'FERIAS' | 'FOLGA'

export interface Ausencia {
  id: string
  tipo: TipoAusencia
  dataInicio: string // ISO date string from the server
  dataFim: string
  nota: string | null
}

export interface Totais {
  ferias: number
  folga: number
  total: number
}

export interface MembroFerias {
  id: string
  nome: string
  ausencias: Ausencia[]
  totais: Totais
}

export const TIPO_LABEL: Record<TipoAusencia, string> = {
  FERIAS: 'Férias',
  FOLGA: 'Folga',
}

// Tailwind colour tokens per tipo, reused across calendar dots, badges and Gantt bars.
export const TIPO_COR: Record<TipoAusencia, { dot: string; bar: string; badge: string }> = {
  FERIAS: {
    dot: 'bg-blue-500',
    bar: 'bg-blue-500/80 hover:bg-blue-500',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  },
  FOLGA: {
    dot: 'bg-amber-500',
    bar: 'bg-amber-500/80 hover:bg-amber-500',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  },
}
