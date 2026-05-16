import type { EstadoInquerito, FaseProcessual } from '@/generated/prisma/enums'

export const ESTADO_LABELS: Record<EstadoInquerito, string> = {
  ABERTO: 'Aberto',
  EM_INVESTIGACAO: 'Em Investigação',
  SUSPENSO: 'Suspenso',
  CONCLUIDO: 'Concluído',
  ARQUIVADO: 'Arquivado',
}

export const ESTADO_COLORS: Record<EstadoInquerito, string> = {
  ABERTO: 'bg-blue-100 text-blue-800 border-blue-200',
  EM_INVESTIGACAO: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  SUSPENSO: 'bg-orange-100 text-orange-800 border-orange-200',
  CONCLUIDO: 'bg-green-100 text-green-800 border-green-200',
  ARQUIVADO: 'bg-gray-100 text-gray-700 border-gray-200',
}

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

export const ESTADOS_FINAIS: EstadoInquerito[] = ['CONCLUIDO', 'ARQUIVADO']

// Auth / security policy
export const LOGIN_MAX_FAILED_ATTEMPTS = 5
export const LOGIN_LOCKOUT_MINUTES = 15
export const LOGIN_ATTEMPT_WINDOW_MINUTES = 30
