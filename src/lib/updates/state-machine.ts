/**
 * Máquina de estados para o fluxo de auto-atualização da app.
 *
 * O estado é guardado como string em `AtualizacaoSistema.state` (em vez de
 * enum Prisma) para evitar migrações ao adicionar estados intermédios.
 * Todas as transições passam por `assertTransition()` que valida o grafo
 * abaixo; escritas diretas à BD que ignorem este helper podem corromper a
 * máquina e devem ser code-reviewed com cuidado.
 *
 * Fluxo nominal (happy path):
 *   AVAILABLE → BACKING_UP → PULLING → MIGRATING → BUILDING
 *             → RESTARTING → HEALTHCHECK → DONE
 *
 * Falhas pós-BACKING_UP entram no ramo de rollback:
 *   any → ROLLING_BACK → ROLLED_BACK | FAILED
 *
 * BACKING_UP que falhe vai direto a FAILED (nada a reverter).
 */

export type UpdateState =
  | 'AVAILABLE'
  | 'BACKING_UP'
  | 'PULLING'
  | 'MIGRATING'
  | 'BUILDING'
  | 'RESTARTING'
  | 'HEALTHCHECK'
  | 'DONE'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'
  | 'FAILED'

export const TERMINAL_STATES: ReadonlySet<UpdateState> = new Set<UpdateState>([
  'DONE',
  'ROLLED_BACK',
  'FAILED',
])

export function isTerminal(state: UpdateState): boolean {
  return TERMINAL_STATES.has(state)
}

const TRANSITIONS: Record<UpdateState, ReadonlyArray<UpdateState>> = {
  AVAILABLE:    ['BACKING_UP', 'FAILED'],
  BACKING_UP:   ['PULLING', 'FAILED'],
  PULLING:      ['MIGRATING', 'ROLLING_BACK'],
  MIGRATING:    ['BUILDING', 'ROLLING_BACK'],
  BUILDING:     ['RESTARTING', 'ROLLING_BACK'],
  RESTARTING:   ['HEALTHCHECK', 'ROLLING_BACK'],
  HEALTHCHECK:  ['DONE', 'ROLLING_BACK'],
  ROLLING_BACK: ['ROLLED_BACK', 'FAILED'],
  DONE:         [],
  ROLLED_BACK:  [],
  FAILED:       [],
}

export function canTransition(from: UpdateState, to: UpdateState): boolean {
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(from: UpdateState, to: UpdateState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transição inválida: ${from} → ${to}`)
  }
}

/**
 * Labels humanos para o UI (badges, history). Em PT-PT para coerência com
 * o resto da app.
 */
export const STATE_LABELS: Record<UpdateState, string> = {
  AVAILABLE: 'Disponível',
  BACKING_UP: 'A criar backup',
  PULLING: 'A obter código',
  MIGRATING: 'A migrar BD',
  BUILDING: 'A construir imagem',
  RESTARTING: 'A reiniciar',
  HEALTHCHECK: 'A verificar saúde',
  DONE: 'Concluído',
  ROLLING_BACK: 'A reverter',
  ROLLED_BACK: 'Revertido',
  FAILED: 'Falhou',
}

/**
 * Estados não-terminais (qualquer atualização que ainda não acabou).
 * Inclui AVAILABLE — uma linha enfileirada à espera do worker conta como
 * em curso para fins de mutex anti-concorrência.
 */
export function isInProgress(state: UpdateState): boolean {
  return !isTerminal(state)
}

/**
 * Subset de `isInProgress` que indica trabalho ativo (não apenas
 * enfileirado). Útil para o UI distinguir entre "à espera de começar" e
 * "a meio das fases destrutivas".
 */
export function isActivelyRunning(state: UpdateState): boolean {
  return state !== 'AVAILABLE' && !isTerminal(state)
}
