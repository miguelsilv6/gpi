import { describe, test, expect } from 'vitest'
import { csvCell, buildCsv } from '@/lib/csv'
import { parseFiltrosLista, filtrosParams } from '@/lib/lista-filtros'

describe('csvCell', () => {
  test('escapa aspas, vírgulas e quebras de linha', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('diz "olá"')).toBe('"diz ""olá"""')
    expect(csvCell('linha1\nlinha2')).toBe('"linha1\nlinha2"')
  })

  test('neutraliza fórmulas (CSV injection)', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+351912345678')).toBe("'+351912345678")
    expect(csvCell('-1')).toBe("'-1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  test('null/undefined vazios e datas em dd/MM/yyyy', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(new Date(2026, 0, 5))).toBe('05/01/2026')
  })

  test('buildCsv começa com BOM e junta linhas', () => {
    const csv = buildCsv(['A', 'B'], [[1, 'x,y']])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1)).toBe('A,B\n1,"x,y"')
  })
})

describe('parseFiltrosLista', () => {
  const de = (o: Record<string, string>) => parseFiltrosLista((k) => o[k])

  test('datas válidas cobrem o dia inteiro; inválidas são ignoradas', () => {
    const f = de({ q: '  telemóvel ', de: '2026-01-01', ate: '2026-01-31' })
    expect(f.q).toBe('telemóvel')
    expect(f.de?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(f.ate?.toISOString()).toBe('2026-01-31T23:59:59.999Z')
    expect(de({ de: '01/01/2026', ate: 'x' })).toEqual({ q: '', de: null, ate: null })
  })

  test('filtrosParams só inclui os preenchidos e válidos', () => {
    expect(filtrosParams({ q: ' a ', de: '2026-01-01', ate: 'lixo' }).toString()).toBe('q=a&de=2026-01-01')
  })
})
