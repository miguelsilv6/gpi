import { describe, test, expect } from 'vitest'
import { parseDataHoraPt, formatDataHoraPt, momentoProduto } from '@/lib/datetime-pt'

describe('parseDataHoraPt', () => {
  test('faz parse de dd-mm-aaaa hh:mm:ss como hora de parede (campos UTC)', () => {
    const d = parseDataHoraPt('09-10-2026 14:05:30')
    expect(d?.toISOString()).toBe('2026-10-09T14:05:30.000Z')
  })

  test('aceita sem segundos (assume :00) e espaços nas pontas', () => {
    expect(parseDataHoraPt('  01-02-2026 08:30 ')?.toISOString()).toBe('2026-02-01T08:30:00.000Z')
  })

  test.each([
    '',
    '2026-10-09 14:05:30',
    '09/10/2026 14:05:30',
    '9-10-2026 14:05:30',
    '31-02-2026 10:00:00',
    '29-02-2025 10:00:00',
    '09-13-2026 10:00:00',
    '00-10-2026 10:00:00',
    '09-10-2026 24:00:00',
    '09-10-2026 10:60:00',
    '09-10-2026 10:00:60',
    'lixo',
  ])('rejeita %s', (raw) => {
    expect(parseDataHoraPt(raw)).toBeNull()
  })

  test('aceita 29 de fevereiro em ano bissexto', () => {
    expect(parseDataHoraPt('29-02-2028 00:00:00')?.toISOString()).toBe('2028-02-29T00:00:00.000Z')
  })

  test('formatar e voltar a fazer parse é estável', () => {
    const raw = '05-03-2027 07:08:09'
    expect(formatDataHoraPt(parseDataHoraPt(raw)!)).toBe(raw)
    expect(formatDataHoraPt('2026-12-31T23:59:59.000Z')).toBe('31-12-2026 23:59:59')
  })
})

describe('momentoProduto', () => {
  const dia = new Date('2026-06-15T00:00:00.000Z')

  test('soma a hora de início ao dia', () => {
    expect(momentoProduto(dia, '14:30').toISOString()).toBe('2026-06-15T14:30:00.000Z')
    expect(momentoProduto(dia, '07:05:09').toISOString()).toBe('2026-06-15T07:05:09.000Z')
  })

  test('sem hora (ou hora inválida) conta como início do dia', () => {
    expect(momentoProduto(dia, null).toISOString()).toBe('2026-06-15T00:00:00.000Z')
    expect(momentoProduto(dia, undefined).toISOString()).toBe('2026-06-15T00:00:00.000Z')
    expect(momentoProduto(dia, 'xx').toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })

  test('ignora a parte horária de `data` (só conta o dia)', () => {
    expect(momentoProduto(new Date('2026-06-15T10:00:00.000Z'), '01:00').toISOString()).toBe(
      '2026-06-15T01:00:00.000Z',
    )
  })
})
