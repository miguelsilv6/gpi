import { describe, test, expect } from 'vitest'
import { computeDocumentacaoPendenteUpdate } from '@/lib/documentacao-pendente'

/**
 * Regras de cálculo dos campos de "documentação pendente" — em especial a
 * gestão do `...Desde` (preenchido só na transição para pendente; preservado se
 * já estava; limpo ao resolver).
 */

const DESDE = new Date('2026-06-01T10:00:00Z')
const NOW = new Date('2026-06-26T09:00:00Z')

describe('computeDocumentacaoPendenteUpdate', () => {
  test('marca como pendente: define desde (agora) e guarda a nota', () => {
    const r = computeDocumentacaoPendenteUpdate({
      pendente: true,
      nota: 'Relatório do INML',
      current: { documentacaoPendente: false, documentacaoPendenteDesde: null },
      now: NOW,
    })
    expect(r.documentacaoPendente).toBe(true)
    expect(r.documentacaoPendenteNota).toBe('Relatório do INML')
    expect(r.documentacaoPendenteDesde).toEqual(NOW)
  })

  test('já pendente: preserva o desde original ao editar a nota', () => {
    const r = computeDocumentacaoPendenteUpdate({
      pendente: true,
      nota: 'Falta auto de notícia',
      current: { documentacaoPendente: true, documentacaoPendenteDesde: DESDE },
      now: NOW,
    })
    expect(r.documentacaoPendenteDesde).toEqual(DESDE)
    expect(r.documentacaoPendenteNota).toBe('Falta auto de notícia')
  })

  test('resolver: limpa flag, nota e desde', () => {
    const r = computeDocumentacaoPendenteUpdate({
      pendente: false,
      nota: 'ignorada',
      current: { documentacaoPendente: true, documentacaoPendenteDesde: DESDE },
      now: NOW,
    })
    expect(r).toEqual({
      documentacaoPendente: false,
      documentacaoPendenteNota: null,
      documentacaoPendenteDesde: null,
    })
  })

  test('nota vazia ou só espaços vira null', () => {
    const r = computeDocumentacaoPendenteUpdate({
      pendente: true,
      nota: '   ',
      current: { documentacaoPendente: false, documentacaoPendenteDesde: null },
      now: NOW,
    })
    expect(r.documentacaoPendenteNota).toBeNull()
    expect(r.documentacaoPendente).toBe(true)
  })

  test('nota é trimada', () => {
    const r = computeDocumentacaoPendenteUpdate({
      pendente: true,
      nota: '  Perícia financeira  ',
      current: { documentacaoPendente: false, documentacaoPendenteDesde: null },
      now: NOW,
    })
    expect(r.documentacaoPendenteNota).toBe('Perícia financeira')
  })
})
