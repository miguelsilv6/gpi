import { describe, test, expect } from 'vitest'
import { ESTADO_TRANSICOES, ESTADO_VALUES, isTransicaoEstadoValida } from '@/lib/bugreport-labels'

describe('máquina de estados dos bug reports', () => {
  test('todos os estados do enum têm transições definidas', () => {
    for (const estado of ESTADO_VALUES) {
      expect(ESTADO_TRANSICOES[estado], `falta entrada para ${estado}`).toBeDefined()
    }
  })

  test('transição para o próprio estado é sempre válida (no-op)', () => {
    for (const estado of ESTADO_VALUES) {
      expect(isTransicaoEstadoValida(estado, estado)).toBe(true)
    }
  })

  test('ABERTO não pode saltar diretamente para RESOLVIDO', () => {
    expect(isTransicaoEstadoValida('ABERTO', 'RESOLVIDO')).toBe(false)
  })

  test('fluxo normal: ABERTO → EM_ANALISE → RESOLVIDO', () => {
    expect(isTransicaoEstadoValida('ABERTO', 'EM_ANALISE')).toBe(true)
    expect(isTransicaoEstadoValida('EM_ANALISE', 'RESOLVIDO')).toBe(true)
  })

  test('rejeição direta de um report aberto é permitida', () => {
    expect(isTransicaoEstadoValida('ABERTO', 'REJEITADO')).toBe(true)
  })

  test('estados terminais podem reabrir mas não trocar entre si', () => {
    expect(isTransicaoEstadoValida('RESOLVIDO', 'ABERTO')).toBe(true)
    expect(isTransicaoEstadoValida('RESOLVIDO', 'EM_ANALISE')).toBe(true)
    expect(isTransicaoEstadoValida('REJEITADO', 'ABERTO')).toBe(true)
    expect(isTransicaoEstadoValida('RESOLVIDO', 'REJEITADO')).toBe(false)
    expect(isTransicaoEstadoValida('REJEITADO', 'RESOLVIDO')).toBe(false)
  })
})
