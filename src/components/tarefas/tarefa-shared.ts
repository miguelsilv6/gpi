import type { PrioridadeTarefa } from '@/generated/prisma/enums'

export const PRIORIDADE_LABEL: Record<PrioridadeTarefa, string> = {
  ALTA: 'Alta',
  NORMAL: 'Normal',
  BAIXA: 'Baixa',
}

export const PRIORIDADE_COLOR: Record<PrioridadeTarefa, string> = {
  ALTA: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  NORMAL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  BAIXA: 'bg-muted text-muted-foreground',
}
