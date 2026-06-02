// Fallback labels for the standard estados (used when no DB data is loaded).
// The canonical source is the EstadoInquerito table; use it when possible.
export const ESTADO_LABELS_FALLBACK: Record<string, string> = {
  ABERTO: 'Aberto',
  DISTRIBUIDO: 'Distribuído',
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
// New estados can be added via configurações but these are always there.
export const ESTADO_CODIGOS = {
  ABERTO: 'ABERTO',
  DISTRIBUIDO: 'DISTRIBUIDO',
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
  'DISTRIBUIDO',
  'EM_INVESTIGACAO',
  'SUSPENSO',
  'CONCLUIDO',
  'ARQUIVADO',
])

// State to set when reopening a closed/archived inquérito.
export const REOPEN_ESTADO_CODIGO = 'EM_INVESTIGACAO'

export const NUIPC_REGEX = /^\d+\/\d{2}\.\d+[A-Z][A-Z0-9]*$/i

// Terminal-state codigos (kept for backwards-compat lookups; the canonical
// source is the EstadoInquerito.terminal flag in the DB).
export const ESTADOS_FINAIS_CODIGOS: readonly string[] = ['CONCLUIDO', 'ARQUIVADO']

// Auth / security policy
export const LOGIN_MAX_FAILED_ATTEMPTS = 5
export const LOGIN_LOCKOUT_MINUTES = 15
export const LOGIN_ATTEMPT_WINDOW_MINUTES = 30

// Rate-limit defaults — usados em src/lib/rate-limit.ts. Mudar aqui propaga
// para todos os call-sites; cada endpoint pode override-ar quando justificado.
export const RATE_LIMITS = {
  // Login (NextAuth callback): 10 tentativas / IP / minuto. O lockout do
  // utilizador continua a aplicar-se em paralelo (mesmo email → 5 falhas → 15min).
  LOGIN_PER_IP: { max: 10, windowMs: 60_000 },

  // Password reset request: 3 / IP / 10min. Mais restritivo porque cada hit
  // envia um email.
  PASSWORD_RESET_REQUEST: { max: 3, windowMs: 10 * 60_000 },

  // Password reset confirm: 10 / IP / 10min. Permite múltiplas tentativas
  // legítimas (e.g. user a reler o email) mas trava brute-force ao token.
  PASSWORD_RESET_CONFIRM: { max: 10, windowMs: 10 * 60_000 },

  // Operações pesadas: backup manual, restauro, upload, import.
  // 5 / IP / 5min — suficiente para uso humano, mata scripts agressivos.
  HEAVY_OPERATIONS: { max: 5, windowMs: 5 * 60_000 },

  // Export de relatórios: 30 / IP / 5min. Permite navegar entre formatos
  // (CSV → MD → PDF do mesmo relatório).
  REPORT_EXPORT: { max: 30, windowMs: 5 * 60_000 },
} as const

export const MATRICULA_REGEX = /^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}$/i
