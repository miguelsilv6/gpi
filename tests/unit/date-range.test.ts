import { describe, it, expect } from 'vitest'
import { startOfDayUTC, endOfDayUTC, utcDayRangeFilter } from '@/lib/date-range'

describe('date-range (UTC day boundaries)', () => {
  it('startOfDayUTC é a meia-noite UTC (inclusivo)', () => {
    expect(startOfDayUTC('2026-07-14').toISOString()).toBe('2026-07-14T00:00:00.000Z')
  })

  it('endOfDayUTC é o último instante do dia UTC (inclusivo)', () => {
    expect(endOfDayUTC('2026-07-14').toISOString()).toBe('2026-07-14T23:59:59.999Z')
  })

  it('endOfDayUTC cobre um registo às 12:00 do dataFim — o bug corrigido', () => {
    // `new Date('2026-07-14')` (o antigo `lte`) resolve para a meia-noite e
    // excluiria este registo; o fim-de-dia inclui-o.
    const registo = new Date('2026-07-14T12:00:00.000Z')
    expect(registo <= endOfDayUTC('2026-07-14')).toBe(true)
    expect(registo <= new Date('2026-07-14')).toBe(false) // demonstra o bug antigo
  })

  it('utcDayRangeFilter devolve gte+lte inclusivos', () => {
    expect(utcDayRangeFilter('2026-07-01', '2026-07-14')).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-14T23:59:59.999Z'),
    })
  })

  it('utcDayRangeFilter aceita um só extremo', () => {
    expect(utcDayRangeFilter('2026-07-01', undefined)).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
    })
    expect(utcDayRangeFilter(undefined, '2026-07-14')).toEqual({
      lte: new Date('2026-07-14T23:59:59.999Z'),
    })
  })

  it('utcDayRangeFilter devolve undefined sem extremos (para spread condicional)', () => {
    expect(utcDayRangeFilter(undefined, undefined)).toBeUndefined()
    expect(utcDayRangeFilter(null, null)).toBeUndefined()
  })
})
