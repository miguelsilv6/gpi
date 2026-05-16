import type { EstadoInquerito } from '@/generated/prisma/enums'

// Permitted state transitions.
// CONCLUIDO and ARQUIVADO are terminal states; getting out of them requires
// an explicit "reopen" action (REABERTURA) auditable separately.
const TRANSITIONS: Record<EstadoInquerito, readonly EstadoInquerito[]> = {
  ABERTO: ['ABERTO', 'EM_INVESTIGACAO', 'SUSPENSO', 'CONCLUIDO', 'ARQUIVADO'],
  EM_INVESTIGACAO: ['EM_INVESTIGACAO', 'ABERTO', 'SUSPENSO', 'CONCLUIDO', 'ARQUIVADO'],
  SUSPENSO: ['SUSPENSO', 'ABERTO', 'EM_INVESTIGACAO', 'CONCLUIDO', 'ARQUIVADO'],
  CONCLUIDO: ['CONCLUIDO', 'ARQUIVADO'],
  ARQUIVADO: ['ARQUIVADO'],
}

export function isTerminal(estado: EstadoInquerito): boolean {
  return estado === 'CONCLUIDO' || estado === 'ARQUIVADO'
}

export function canTransition(
  from: EstadoInquerito,
  to: EstadoInquerito,
): boolean {
  return TRANSITIONS[from].includes(to)
}

// Returns the list of valid next states given the current one.
export function allowedNextStates(from: EstadoInquerito): readonly EstadoInquerito[] {
  return TRANSITIONS[from]
}
