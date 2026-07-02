import { describe, test, expect } from 'vitest'
import { cutoffDate, inatividadeRef, isElegivel } from '@/lib/auto-transicao'

describe('cutoffDate', () => {
  test('recua N meses', () => {
    const now = new Date('2026-07-02T10:00:00.000Z')
    expect(cutoffDate(now, 12).toISOString().slice(0, 10)).toBe('2025-07-02')
    expect(cutoffDate(now, 3).toISOString().slice(0, 10)).toBe('2026-04-02')
  })
})

describe('inatividadeRef', () => {
  const estadoDesde = new Date('2025-01-01T00:00:00.000Z')

  test('sem atividades usa a entrada no estado', () => {
    expect(inatividadeRef(estadoDesde, null)).toEqual(estadoDesde)
  })

  test('atividade mais recente vence a entrada no estado', () => {
    const ultima = new Date('2025-06-01T00:00:00.000Z')
    expect(inatividadeRef(estadoDesde, ultima)).toEqual(ultima)
  })

  test('entrada no estado mais recente que a atividade vence', () => {
    const ultima = new Date('2024-06-01T00:00:00.000Z')
    expect(inatividadeRef(estadoDesde, ultima)).toEqual(estadoDesde)
  })
})

describe('isElegivel', () => {
  const cutoff = new Date('2025-07-02T00:00:00.000Z')

  test('referência anterior ao cutoff é elegível', () => {
    expect(isElegivel(new Date('2025-07-01T00:00:00.000Z'), cutoff)).toBe(true)
  })

  test('referência posterior ao cutoff não é elegível', () => {
    expect(isElegivel(new Date('2025-07-03T00:00:00.000Z'), cutoff)).toBe(false)
  })
})
