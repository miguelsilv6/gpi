import { describe, test, expect } from 'vitest'
import { countWorkingDays, countByTipo, isWorkingDay } from '@/lib/ferias'

// Local-midnight Date from 'YYYY-MM-DD'.
function d(s: string): Date {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y!, m! - 1, day!)
}

describe('countWorkingDays', () => {
  test('uma semana completa (seg-sex) = 5 dias úteis', () => {
    // 2025-06-02 (segunda) → 2025-06-06 (sexta)
    expect(countWorkingDays(d('2025-06-02'), d('2025-06-06'))).toBe(5)
  })

  test('exclui sábado e domingo', () => {
    // 2025-06-02 (seg) → 2025-06-08 (dom): 5 úteis + sáb + dom
    expect(countWorkingDays(d('2025-06-02'), d('2025-06-08'))).toBe(5)
  })

  test('um único dia útil = 1', () => {
    expect(countWorkingDays(d('2025-06-03'), d('2025-06-03'))).toBe(1)
  })

  test('um único dia de fim de semana = 0', () => {
    // 2025-06-07 é sábado
    expect(countWorkingDays(d('2025-06-07'), d('2025-06-07'))).toBe(0)
  })

  test('exclui feriado fixo (25 de Abril, sexta em 2025)', () => {
    // 2025-04-21 (seg) → 2025-04-25 (sex). 25/04 é feriado → 4 úteis.
    expect(countWorkingDays(d('2025-04-21'), d('2025-04-25'))).toBe(4)
  })

  test('exclui feriado móvel — Sexta-Santa 2025 (2025-04-18)', () => {
    // 2025-04-14 (seg) → 2025-04-18 (sex). Sexta-Santa cai a 18/04 → 4 úteis.
    expect(countWorkingDays(d('2025-04-14'), d('2025-04-18'))).toBe(4)
  })

  test('range que cruza o ano conta os dias úteis de ambos os anos', () => {
    // 2025-12-29 (seg) → 2026-01-02 (sex). 01/01/2026 é feriado (Ano Novo).
    // Úteis: 29,30,31 Dez (3) + 02 Jan (1) = 4. (01 Jan feriado, sáb/dom fora.)
    expect(countWorkingDays(d('2025-12-29'), d('2026-01-02'))).toBe(4)
  })

  test('fim antes do início = 0', () => {
    expect(countWorkingDays(d('2025-06-10'), d('2025-06-01'))).toBe(0)
  })
})

describe('isWorkingDay', () => {
  test('dia de semana normal', () => {
    expect(isWorkingDay(d('2025-06-03'))).toBe(true)
  })
  test('sábado', () => {
    expect(isWorkingDay(d('2025-06-07'))).toBe(false)
  })
  test('feriado (Natal)', () => {
    expect(isWorkingDay(d('2025-12-25'))).toBe(false)
  })
})

describe('countByTipo', () => {
  test('separa férias e folgas e soma o total', () => {
    const ausencias = [
      { tipo: 'FERIAS' as const, dataInicio: '2025-06-02', dataFim: '2025-06-06' }, // 5
      { tipo: 'FOLGA' as const, dataInicio: '2025-06-09', dataFim: '2025-06-09' }, // 1
    ]
    expect(countByTipo(ausencias)).toEqual({ ferias: 5, folga: 1, total: 6 })
  })

  test('clampa ao ano indicado num range que cruza o ano', () => {
    const ausencias = [
      // 2025-12-29 → 2026-01-02: só conta a parte de 2026 quando ano=2026.
      { tipo: 'FERIAS' as const, dataInicio: '2025-12-29', dataFim: '2026-01-02' },
    ]
    // Em 2026: apenas 02/01 (01/01 feriado, 03/01 fora do range) = 1 útil.
    expect(countByTipo(ausencias, 2026).ferias).toBe(1)
    // Em 2025: 29,30,31 Dez = 3 úteis.
    expect(countByTipo(ausencias, 2025).ferias).toBe(3)
  })
})
