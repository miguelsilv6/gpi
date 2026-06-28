import { describe, test, expect } from 'vitest'
import { computeDocumentacaoPendenteUpdate } from '@/lib/documentacao-pendente'

/**
 * Regras de cálculo dos campos de "documentação pendente" — gestão do `...Desde`
 * e do `...PorId` (preenchidos só na transição para pendente; preservados se já
 * estava; limpos ao resolver) e normalização da nota.
 */

const DESDE = new Date('2026-06-01T10:00:00Z')
const NOW = new Date('2026-06-26T09:00:00Z')
const USER = 'user-A'
const OUTRO = 'user-B'

describe('computeDocumentacaoPendenteUpdate', () => {
  test('marca como pendente: define desde, autor e guarda a nota', () => {
    const r = computeDocumentacaoPendenteUpdate({
      pendente: true,
      nota: 'Relatório do INML',
      userId: USER,
      current: {
        documentacaoPendente: false,
        documentacaoPendenteDesde: null,
        documentacaoPendentePorId: null,
      },
      now: NOW,
    })
    expect(r.documentacaoPendente).toBe(true)
    expect(r.documentacaoPendenteNota).toBe('Relatório do INML')
    expect(r.documentacaoPendenteDesde).toEqual(NOW)
    expect(r.documentacaoPendentePorId).toBe(USER)
  })

  test('já pendente: preserva desde e autor originais mesmo se outro edita a nota', () => {
    const r = computeDocumentacaoPendenteUpdate({
      pendente: true,
      nota: 'Falta auto de notícia',
      userId: OUTRO,
      current: {
        documentacaoPendente: true,
        documentacaoPendenteDesde: DESDE,
        documentacaoPendentePorId: USER,
      },
      now: NOW,
    })
    expect(r.documentacaoPendenteDesde).toEqual(DESDE)
    expect(r.documentacaoPendentePorId).toBe(USER)
    expect(r.documentacaoPendenteNota).toBe('Falta auto de notícia')
  })

  test('resolver: limpa flag, nota, desde e autor', () => {
    const r = computeDocumentacaoPendenteUpdate({
      pendente: false,
      nota: 'ignorada',
      userId: USER,
      current: {
        documentacaoPendente: true,
        documentacaoPendenteDesde: DESDE,
        documentacaoPendentePorId: USER,
      },
      now: NOW,
    })
    expect(r).toEqual({
      documentacaoPendente: false,
      documentacaoPendenteNota: null,
      documentacaoPendenteDesde: null,
      documentacaoPendentePorId: null,
    })
  })

  test('nota vazia/só espaços vira null; nota é trimada', () => {
    const vazia = computeDocumentacaoPendenteUpdate({
      pendente: true,
      nota: '   ',
      userId: USER,
      current: {
        documentacaoPendente: false,
        documentacaoPendenteDesde: null,
        documentacaoPendentePorId: null,
      },
      now: NOW,
    })
    expect(vazia.documentacaoPendenteNota).toBeNull()

    const trim = computeDocumentacaoPendenteUpdate({
      pendente: true,
      nota: '  Perícia financeira  ',
      userId: USER,
      current: {
        documentacaoPendente: false,
        documentacaoPendenteDesde: null,
        documentacaoPendentePorId: null,
      },
      now: NOW,
    })
    expect(trim.documentacaoPendenteNota).toBe('Perícia financeira')
  })
})
