import type { FaseProcessual } from '@/generated/prisma/enums'

// Fallback labels for the 5 standard estados (used when no DB data is loaded).
// The canonical source is the EstadoInquerito table; use it when possible.
export const ESTADO_LABELS_FALLBACK: Record<string, string> = {
  ABERTO: 'Aberto',
  EM_INVESTIGACAO: 'Em Investigação',
  SUSPENSO: 'Suspenso',
  CONCLUIDO: 'Concluído',
  ARQUIVADO: 'Arquivado',
}

// Tailwind classes keyed by the `cor` field on EstadoInquerito.
export const ESTADO_COR_CLASSES: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
  green: 'bg-green-100 text-green-800 border-green-200',
  gray: 'bg-gray-100 text-gray-700 border-gray-200',
  red: 'bg-red-100 text-red-800 border-red-200',
  purple: 'bg-purple-100 text-purple-800 border-purple-200',
  slate: 'bg-slate-100 text-slate-800 border-slate-200',
}

export const ESTADO_COR_DEFAULT = 'bg-gray-100 text-gray-700 border-gray-200'

export const ESTADO_COR_OPTIONS = ['blue', 'yellow', 'orange', 'green', 'gray', 'red', 'purple', 'slate']

// Standard codigos (these are what the SEED creates and what code-paths reference).
// New estados can be added via configurações but these 5 are always there.
export const ESTADO_CODIGOS = {
  ABERTO: 'ABERTO',
  EM_INVESTIGACAO: 'EM_INVESTIGACAO',
  SUSPENSO: 'SUSPENSO',
  CONCLUIDO: 'CONCLUIDO',
  ARQUIVADO: 'ARQUIVADO',
} as const

// Codigos that the system treats as "protected" — they cannot be deleted
// (renaming/deactivating is OK). The code depends on these for special logic
// like the default reopen state.
export const PROTECTED_ESTADO_CODIGOS = new Set<string>([
  'ABERTO',
  'EM_INVESTIGACAO',
  'SUSPENSO',
  'CONCLUIDO',
  'ARQUIVADO',
])

// State to set when reopening a closed/archived inquérito.
export const REOPEN_ESTADO_CODIGO = 'EM_INVESTIGACAO'

export const FASE_LABELS: Record<FaseProcessual, string> = {
  INQUERITO: 'Inquérito',
  INSTRUCAO: 'Instrução',
  JULGAMENTO: 'Julgamento',
  RECURSO: 'Recurso',
  TRANSITO_EM_JULGADO: 'Trânsito em Julgado',
}

export const FASE_COLORS: Record<FaseProcessual, string> = {
  INQUERITO: 'bg-slate-100 text-slate-700 border-slate-200',
  INSTRUCAO: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  JULGAMENTO: 'bg-violet-100 text-violet-800 border-violet-200',
  RECURSO: 'bg-rose-100 text-rose-800 border-rose-200',
  TRANSITO_EM_JULGADO: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}

export const NUIPC_REGEX = /^\d{4}\/\d+\/[A-Z]+$/

// Terminal-state codigos (kept for backwards-compat lookups; the canonical
// source is the EstadoInquerito.terminal flag in the DB).
export const ESTADOS_FINAIS_CODIGOS: readonly string[] = ['CONCLUIDO', 'ARQUIVADO']

// Auth / security policy
export const LOGIN_MAX_FAILED_ATTEMPTS = 5
export const LOGIN_LOCKOUT_MINUTES = 15
export const LOGIN_ATTEMPT_WINDOW_MINUTES = 30
