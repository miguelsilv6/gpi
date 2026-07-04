import { describe, test, expect } from 'vitest'
import { buildIntercecoesWorkbook, type XlsxData } from '@/lib/intercecoes-xlsx'

function sampleData(): XlsxData {
  return {
    nuipc: '123/24.0GBABC',
    alvos: [
      {
        nome: 'Nome 1',
        codigo: '123',
        observacoes: 'obs do alvo',
        notas: 'nota livre do inspetor',
        linhas: [
          {
            tipo: 'SIM',
            identificador: '912345678',
            rede: 'MEO',
            dataInicio: new Date('2026-05-05T00:00:00Z'),
            dataFim: new Date('2026-06-05T00:00:00Z'),
            renovacoes: 2,
            observacoes: null,
          },
        ],
        produtos: [
          {
            tipo: 'CHAMADA',
            numeroProduto: '1',
            direcao: 'EFETUADA',
            data: new Date('2026-05-06T00:00:00Z'),
            horaInicio: '09:30',
            horaFim: '09:45',
            duracao: '15:00',
            paraTranscricao: true,
            de: '912345678',
            para: '939999999',
            resumo: 'Conversa relevante',
            comentarios: null,
            linha: { identificador: '912345678' },
          },
        ],
      },
      {
        // Alvo sem linhas nem produtos: deve na mesma gerar folha própria.
        nome: 'Nome 2',
        codigo: '456',
        observacoes: null,
        notas: null,
        linhas: [],
        produtos: [],
      },
    ],
  }
}

describe('buildIntercecoesWorkbook', () => {
  test('gera folha "Alvos" + uma folha por código', () => {
    const wb = buildIntercecoesWorkbook(sampleData())
    const names = wb.worksheets.map((w) => w.name)
    expect(names[0]).toBe('Alvos')
    expect(names).toContain('123')
    expect(names).toContain('456')
    expect(names).toHaveLength(3)
  })

  test('folha Alvos: cabeçalhos e um registo por linha (com renovações e notas)', () => {
    const wb = buildIntercecoesWorkbook(sampleData())
    const ws = wb.getWorksheet('Alvos')!
    const header = ws.getRow(1).values as unknown[]
    expect(header).toContain('Suspeito')
    expect(header).toContain('Renovações')
    expect(header).toContain('Notas do alvo')

    // Linha 2 = primeira linha do alvo "Nome 1"
    const row = ws.getRow(2)
    expect(row.getCell(1).value).toBe('Nome 1')
    expect(row.getCell(3).value).toBe('Cartão SIM') // label do tipo
    expect(row.getCell(8).value).toBe(2) // renovações
    expect(row.getCell(10).value).toBe('nota livre do inspetor') // notas do alvo
  })

  test('alvo sem linhas gera na mesma um registo na folha Alvos', () => {
    const wb = buildIntercecoesWorkbook(sampleData())
    const ws = wb.getWorksheet('Alvos')!
    // rowCount inclui o cabeçalho; esperamos 3 (cabeçalho + 1 linha do alvo 1 + 1 do alvo 2 sem linhas)
    expect(ws.rowCount).toBe(3)
    const last = ws.getRow(3)
    expect(last.getCell(1).value).toBe('Nome 2')
    expect(last.getCell(3).value ?? '').toBe('') // sem tipo
  })

  test('folha do código: produto com duração e transcrição', () => {
    const wb = buildIntercecoesWorkbook(sampleData())
    const ws = wb.getWorksheet('123')!
    const header = ws.getRow(1).values as unknown[]
    expect(header).toContain('Tipo de Produto')
    expect(header).toContain('Duração')
    expect(header).toContain('Transcrição')

    const row = ws.getRow(2)
    expect(row.getCell(1).value).toBe('Chamada')
    expect(row.getCell(8).value).toBe('15:00') // duração
    expect(row.getCell(12).value).toBe('Sim') // transcrição marcada
  })

  test('nomes de folha: sanitiza caracteres inválidos e resolve colisões', () => {
    const data: XlsxData = {
      nuipc: 'x',
      alvos: [
        { nome: 'A', codigo: 'a/b:c', observacoes: null, notas: null, linhas: [], produtos: [] },
        { nome: 'B', codigo: 'a b c', observacoes: null, notas: null, linhas: [], produtos: [] },
      ],
    }
    const wb = buildIntercecoesWorkbook(data)
    const names = wb.worksheets.map((w) => w.name)
    // Sem caracteres proibidos em nenhum nome de folha.
    for (const n of names) expect(n).not.toMatch(/[:\\/?*[\]]/)
    // Os dois códigos colapsam para "a b c" → o segundo recebe sufixo único.
    expect(new Set(names).size).toBe(names.length)
  })

  test('nome de folha demasiado longo é truncado a 31 caracteres', () => {
    const data: XlsxData = {
      nuipc: 'x',
      alvos: [
        {
          nome: 'A',
          codigo: 'X'.repeat(60),
          observacoes: null,
          notas: null,
          linhas: [],
          produtos: [],
        },
      ],
    }
    const wb = buildIntercecoesWorkbook(data)
    const sheet = wb.worksheets[1]
    expect(sheet.name.length).toBeLessThanOrEqual(31)
  })
})
