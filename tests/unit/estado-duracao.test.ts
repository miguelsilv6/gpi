import { describe, test, expect } from 'vitest'
import { buildEstadoDuracao, formatDuracaoDias } from '@/lib/estado-duracao'
import type { EstadoTimelineEntry } from '@/lib/estado-timeline'

function entry(overrides: Partial<EstadoTimelineEntry> & Pick<EstadoTimelineEntry, 'at' | 'estadoCodigo' | 'estadoNome'>): EstadoTimelineEntry {
  return { cor: null, porNome: null, ...overrides }
}

describe('buildEstadoDuracao', () => {
  test('sem entradas devolve lista vazia', () => {
    expect(buildEstadoDuracao([])).toEqual([])
  })

  test('uma entrada única fica em curso (fim null, atual true) até `now`', () => {
    const now = new Date('2026-01-10T00:00:00.000Z')
    const segmentos = buildEstadoDuracao(
      [entry({ at: '2026-01-01T00:00:00.000Z', estadoCodigo: 'ABERTO', estadoNome: 'Aberto', cor: 'blue' })],
      now,
    )
    expect(segmentos).toHaveLength(1)
    expect(segmentos[0]).toMatchObject({
      estadoCodigo: 'ABERTO',
      estadoNome: 'Aberto',
      cor: 'blue',
      inicio: '2026-01-01T00:00:00.000Z',
      fim: null,
      atual: true,
      dias: 9,
    })
  })

  test('cada segmento termina no início do seguinte; só o último fica em curso', () => {
    const segmentos = buildEstadoDuracao(
      [
        entry({ at: '2026-01-01T00:00:00.000Z', estadoCodigo: 'ABERTO', estadoNome: 'Aberto' }),
        entry({ at: '2026-01-03T00:00:00.000Z', estadoCodigo: 'DISTRIBUIDO', estadoNome: 'Distribuído' }),
        entry({ at: '2026-01-08T00:00:00.000Z', estadoCodigo: 'EM_INVESTIGACAO', estadoNome: 'Em Investigação' }),
      ],
      new Date('2026-02-01T00:00:00.000Z'),
    )
    expect(segmentos.map((s) => [s.estadoCodigo, s.fim, s.atual, s.dias])).toEqual([
      ['ABERTO', '2026-01-03T00:00:00.000Z', false, 2],
      ['DISTRIBUIDO', '2026-01-08T00:00:00.000Z', false, 5],
      ['EM_INVESTIGACAO', null, true, 24],
    ])
  })

  test('transição no mesmo dia de calendário conta como 0 dias', () => {
    const segmentos = buildEstadoDuracao([
      entry({ at: '2026-01-01T09:00:00.000Z', estadoCodigo: 'ABERTO', estadoNome: 'Aberto' }),
      entry({ at: '2026-01-01T17:00:00.000Z', estadoCodigo: 'DISTRIBUIDO', estadoNome: 'Distribuído' }),
    ])
    expect(segmentos[0]!.dias).toBe(0)
    expect(segmentos[0]!.duracaoMs).toBe(8 * 60 * 60 * 1000)
  })

  test('diferença de calendário conta o dia mesmo com poucos minutos de intervalo perto da meia-noite', () => {
    // 23:59 → 00:01 do dia seguinte: ~2 minutos reais, mas 1 dia de calendário.
    // Documentado propositadamente — a barra usa duracaoMs (tempo real) para a
    // largura visual, e `dias` (calendário) só para o texto da legenda.
    const segmentos = buildEstadoDuracao([
      entry({ at: '2026-01-01T23:59:00.000Z', estadoCodigo: 'ABERTO', estadoNome: 'Aberto' }),
      entry({ at: '2026-01-02T00:01:00.000Z', estadoCodigo: 'DISTRIBUIDO', estadoNome: 'Distribuído' }),
    ])
    expect(segmentos[0]!.dias).toBe(1)
    expect(segmentos[0]!.duracaoMs).toBe(2 * 60 * 1000)
  })

  test('motivo só aparece quando presente na entrada', () => {
    const [comMotivo, semMotivo] = buildEstadoDuracao([
      entry({ at: '2026-01-01T00:00:00.000Z', estadoCodigo: 'EM_INVESTIGACAO', estadoNome: 'Em Investigação', motivo: 'Nova prova' }),
      entry({ at: '2026-01-05T00:00:00.000Z', estadoCodigo: 'CONCLUIDO', estadoNome: 'Concluído' }),
    ])
    expect(comMotivo!.motivo).toBe('Nova prova')
    expect('motivo' in semMotivo!).toBe(false)
  })

  test('porNome e cor são propagados tal e qual', () => {
    const [seg] = buildEstadoDuracao([
      entry({ at: '2026-01-01T00:00:00.000Z', estadoCodigo: 'ARQUIVADO', estadoNome: 'Arquivado', cor: 'slate', porNome: 'Coord. Silva' }),
    ])
    expect(seg!.cor).toBe('slate')
    expect(seg!.porNome).toBe('Coord. Silva')
  })

  test('chave estável combina código e instante — sem colisões entre reaberturas para o mesmo estado', () => {
    const segmentos = buildEstadoDuracao([
      entry({ at: '2026-01-01T00:00:00.000Z', estadoCodigo: 'EM_INVESTIGACAO', estadoNome: 'Em Investigação' }),
      entry({ at: '2026-02-01T00:00:00.000Z', estadoCodigo: 'CONCLUIDO', estadoNome: 'Concluído' }),
      entry({ at: '2026-03-01T00:00:00.000Z', estadoCodigo: 'EM_INVESTIGACAO', estadoNome: 'Em Investigação' }),
    ])
    const keys = segmentos.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('formatDuracaoDias', () => {
  test('0 dias mostra "< 1 dia"', () => {
    expect(formatDuracaoDias(0)).toBe('< 1 dia')
  })

  test('singular vs plural', () => {
    expect(formatDuracaoDias(1)).toBe('1 dia')
    expect(formatDuracaoDias(2)).toBe('2 dias')
    expect(formatDuracaoDias(38)).toBe('38 dias')
  })
})
