import { describe, test, expect } from 'vitest'
import {
  formatCursor,
  parseCursor,
  compareCursor,
  afterCursorWhere,
  parseHistorico,
} from '@/lib/prazos-cursor'

const D = new Date('2026-06-15T00:00:00.000Z')

describe('prazos-cursor', () => {
  test('formata e faz parse de ida e volta', () => {
    const c = { date: D, rank: 1 as const, id: 'abc_123-X' }
    const raw = formatCursor(c)
    expect(raw).toBe('2026-06-15T00:00:00.000Z_1_abc_123-X')
    expect(parseCursor(raw)).toEqual(c)
  })

  test.each([null, undefined, '', 'lixo', '2026-06-15_0_x', '2026-13-45T00:00:00.000Z_0_x', '2026-06-15T00:00:00.000Z_2_x'])(
    'cursor inválido (%s) devolve null',
    (raw) => {
      expect(parseCursor(raw as string | null | undefined)).toBeNull()
    },
  )

  test('ordem total: data, depois rank, depois id', () => {
    const a = { date: D, rank: 0 as const, id: 'b' }
    const b = { date: D, rank: 1 as const, id: 'a' }
    const c = { date: new Date('2026-06-16T00:00:00.000Z'), rank: 0 as const, id: 'a' }
    const d = { date: D, rank: 0 as const, id: 'c' }
    const sorted = [c, d, b, a].sort(compareCursor)
    expect(sorted).toEqual([a, d, b, c])
  })

  test('afterCursorWhere: sem cursor não filtra', () => {
    expect(afterCursorWhere('dataPrazo', 0, null)).toEqual({})
  })

  test('afterCursorWhere: fonte de rank menor exige data estritamente posterior', () => {
    expect(afterCursorWhere('dataPrazo', 0, { date: D, rank: 1, id: 'x' })).toEqual({
      dataPrazo: { gt: D },
    })
  })

  test('afterCursorWhere: fonte de rank maior aceita a mesma data', () => {
    expect(afterCursorWhere('dataFim', 1, { date: D, rank: 0, id: 'x' })).toEqual({
      dataFim: { gte: D },
    })
  })

  test('afterCursorWhere: mesma fonte usa desempate por id', () => {
    expect(afterCursorWhere('dataPrazo', 0, { date: D, rank: 0, id: 'x' })).toEqual({
      OR: [{ dataPrazo: { gt: D } }, { dataPrazo: D, id: { gt: 'x' } }],
    })
  })

  test('parseHistorico', () => {
    expect(parseHistorico(undefined)).toEqual([])
    expect(parseHistorico('-~a~b')).toEqual(['-', 'a', 'b'])
  })
})
