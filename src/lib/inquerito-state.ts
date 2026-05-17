/**
 * State machine for inquérito estados.
 *
 * Now that EstadoInquerito is a configurable table (not an enum), this module
 * works with the `terminal` flag rather than hardcoded codigo names.
 *
 * Rules:
 *  - Any state may be self-targeted (no-op update is valid).
 *  - From a non-terminal state, you can transition to any active state.
 *  - From a terminal state, you can only stay or move to another terminal
 *    state. Reopening (terminal → non-terminal) requires the dedicated
 *    /reopen endpoint, which audits the action and asks for a motivo.
 */

export interface EstadoSummary {
  id: string
  codigo: string
  terminal: boolean
  ativo: boolean
}

export function isTerminal(estado: { terminal: boolean }): boolean {
  return estado.terminal
}

export function canTransition(
  from: { terminal: boolean },
  to: { terminal: boolean; ativo: boolean },
): boolean {
  if (!to.ativo) return false
  if (from.terminal && !to.terminal) return false
  return true
}
