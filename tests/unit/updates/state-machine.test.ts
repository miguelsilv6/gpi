import { describe, test, expect } from 'vitest'
import {
  canTransition,
  assertTransition,
  isTerminal,
  isInProgress,
  TERMINAL_STATES,
  type UpdateState,
} from '@/lib/updates/state-machine'

describe('UpdateState — FSM', () => {
  test('happy path completo é válido', () => {
    const path: UpdateState[] = [
      'AVAILABLE',
      'BACKING_UP',
      'PULLING',
      'MIGRATING',
      'BUILDING',
      'RESTARTING',
      'HEALTHCHECK',
      'DONE',
    ]
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true)
    }
  })

  test('rollback path do MIGRATING é válido', () => {
    expect(canTransition('MIGRATING', 'ROLLING_BACK')).toBe(true)
    expect(canTransition('ROLLING_BACK', 'ROLLED_BACK')).toBe(true)
    expect(canTransition('ROLLING_BACK', 'FAILED')).toBe(true)
  })

  test('BACKING_UP pode ir direto a FAILED (sem rollback necessário)', () => {
    expect(canTransition('BACKING_UP', 'FAILED')).toBe(true)
    expect(canTransition('BACKING_UP', 'ROLLING_BACK')).toBe(false)
  })

  test('estados terminais não têm transições de saída', () => {
    for (const t of TERMINAL_STATES) {
      expect(canTransition(t, 'AVAILABLE')).toBe(false)
      expect(canTransition(t, 'BACKING_UP')).toBe(false)
      expect(canTransition(t, 'ROLLING_BACK')).toBe(false)
    }
  })

  test('AVAILABLE não pode saltar para PULLING (precisa de BACKING_UP primeiro)', () => {
    expect(canTransition('AVAILABLE', 'PULLING')).toBe(false)
    expect(canTransition('AVAILABLE', 'MIGRATING')).toBe(false)
  })

  test('HEALTHCHECK pode passar a DONE ou ROLLING_BACK, nada mais', () => {
    expect(canTransition('HEALTHCHECK', 'DONE')).toBe(true)
    expect(canTransition('HEALTHCHECK', 'ROLLING_BACK')).toBe(true)
    expect(canTransition('HEALTHCHECK', 'FAILED')).toBe(false)
    expect(canTransition('HEALTHCHECK', 'RESTARTING')).toBe(false)
  })

  test('assertTransition lança em transição inválida', () => {
    expect(() => assertTransition('AVAILABLE', 'DONE')).toThrow(/Transição inválida/)
    expect(() => assertTransition('DONE', 'BACKING_UP')).toThrow(/Transição inválida/)
  })

  test('isTerminal cobre os três terminais', () => {
    expect(isTerminal('DONE')).toBe(true)
    expect(isTerminal('FAILED')).toBe(true)
    expect(isTerminal('ROLLED_BACK')).toBe(true)
    expect(isTerminal('BACKING_UP')).toBe(false)
    expect(isTerminal('AVAILABLE')).toBe(false)
  })

  test('isInProgress separa "disponível" e "terminal" do meio do fluxo', () => {
    expect(isInProgress('AVAILABLE')).toBe(false)
    expect(isInProgress('DONE')).toBe(false)
    expect(isInProgress('FAILED')).toBe(false)
    expect(isInProgress('BACKING_UP')).toBe(true)
    expect(isInProgress('ROLLING_BACK')).toBe(true)
  })
})
