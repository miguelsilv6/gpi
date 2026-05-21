import { describe, test, expect } from 'vitest'
import { toCSV, toMarkdown, UTF8_BOM } from '@/lib/relatorios/formatters'
import type { RelatorioResult } from '@/lib/relatorios/types'

function makeResult(over: Partial<RelatorioResult> = {}): RelatorioResult {
  return {
    title: 'Relatório de Teste',
    geradoEm: new Date('2026-05-21T10:00:00Z'),
    geradoPor: 'Administrador Sistema',
    filtros: { Brigada: 'Alpha', Estado: null },
    columns: [
      { key: 'nuipc', label: 'NUIPC' },
      { key: 'crime', label: 'Crime' },
      { key: 'qtd', label: 'Qtd', align: 'right' },
    ],
    rows: [
      { nuipc: '123/22', crime: 'Furto', qtd: 5 },
      { nuipc: '124/22', crime: 'Acesso ilegítimo', qtd: 1 },
    ],
    ...over,
  }
}

describe('UTF8_BOM', () => {
  test('é o BOM canónico de 1 char para UTF-8', () => {
    expect(UTF8_BOM).toBe('﻿')
    expect(UTF8_BOM.length).toBe(1)
  })
})

describe('toCSV', () => {
  test('cabeçalho + linhas + metadados em comentário', () => {
    const csv = toCSV(makeResult())
    // Metadados (linhas começadas por #) ANTES do header
    expect(csv).toMatch(/^# Relatório de Teste/m)
    expect(csv).toMatch(/^# Gerado em.*Administrador Sistema/m)
    expect(csv).toMatch(/^# Filtro: Brigada = Alpha/m)
    // Filtro com valor null é OMITIDO
    expect(csv).not.toMatch(/Filtro: Estado/)
    // Header com labels
    expect(csv).toContain('NUIPC,Crime,Qtd')
    // Dados
    expect(csv).toContain('123/22,Furto,5')
  })

  test('escapa vírgulas, aspas e newlines com aspas duplas', () => {
    const csv = toCSV(
      makeResult({
        rows: [{ nuipc: 'X,Y', crime: 'Tem "aspas"', qtd: 'linha1\nlinha2' }],
      }),
    )
    expect(csv).toContain('"X,Y"')
    expect(csv).toContain('"Tem ""aspas"""')
    expect(csv).toContain('"linha1\nlinha2"')
  })

  test('null/undefined renderiza como célula vazia', () => {
    const csv = toCSV(makeResult({ rows: [{ nuipc: 'A', crime: null, qtd: null }] }))
    expect(csv).toMatch(/^A,,$/m)
  })

  test('quando rows está vazio, inclui header + emptyMessage', () => {
    const csv = toCSV(
      makeResult({ rows: [], emptyMessage: 'Nada para mostrar.' }),
    )
    expect(csv).toContain('NUIPC,Crime,Qtd')
    expect(csv).toContain('Nada para mostrar.')
  })
})

describe('toMarkdown', () => {
  test('inclui frontmatter YAML com metadados', () => {
    const md = toMarkdown(makeResult())
    expect(md).toMatch(/^---\ntitulo: "Relatório de Teste"/)
    expect(md).toContain('gerado_por: "Administrador Sistema"')
  })

  test('tabela GFM com alinhamento direito quando align=right', () => {
    const md = toMarkdown(makeResult())
    // Linha de alinhamento: as colunas marcadas align=right ficam com ---:
    expect(md).toMatch(/\| --- \| --- \| ---: \|/)
  })

  test('escapa pipes em valores de célula', () => {
    const md = toMarkdown(
      makeResult({
        rows: [{ nuipc: 'X|Y', crime: 'normal', qtd: 1 }],
      }),
    )
    expect(md).toContain('X\\|Y')
  })

  test('rows vazias mostra emptyMessage em itálico', () => {
    const md = toMarkdown(
      makeResult({ rows: [], emptyMessage: 'Sem resultados.' }),
    )
    expect(md).toContain('_Sem resultados._')
    // Sem header de tabela quando vazio
    expect(md).not.toMatch(/^\| NUIPC \|/m)
  })

  test('inclui sumário quando presente', () => {
    const md = toMarkdown(
      makeResult({
        summary: [
          { label: 'Total', value: 10 },
          { label: 'Aberto', value: 7 },
        ],
      }),
    )
    expect(md).toContain('**Sumário:**')
    expect(md).toContain('- Total: **10**')
    expect(md).toContain('- Aberto: **7**')
  })
})
