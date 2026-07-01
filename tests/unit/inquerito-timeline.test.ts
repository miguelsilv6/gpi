import { describe, test, expect } from 'vitest'
import {
  mergeTimelineEvents,
  groupEventsByDay,
  excerpt,
  type TimelineSources,
} from '@/lib/inquerito-timeline'

const EMPTY: TimelineSources = {
  abertura: null,
  estados: [],
  atividades: [],
  notas: [],
  documentos: [],
  tarefas: [],
  diligencias: [],
}

describe('mergeTimelineEvents', () => {
  test('intercala todas as fontes ordenadas do mais recente para o mais antigo', () => {
    const events = mergeTimelineEvents({
      ...EMPTY,
      abertura: { dataAbertura: '2026-01-01T00:00:00.000Z', crimeNome: 'Furto' },
      estados: [
        { at: '2026-01-02T10:00:00.000Z', estadoNome: 'Aberto', porNome: 'Ana' },
        { at: '2026-01-05T09:00:00.000Z', estadoNome: 'Em Investigação', porNome: 'Ana' },
      ],
      atividades: [
        { id: 'a1', descricao: 'Inquirição', dataRealizacao: '2026-01-04T00:00:00.000Z', quantidade: null, autorNome: 'Rui' },
      ],
      notas: [
        { id: 'n1', titulo: null, conteudo: 'Suspeito identificado.', createdAt: '2026-01-06T15:30:00.000Z', autorNome: 'Rui' },
      ],
      documentos: [
        { id: 'd1', filename: 'auto.pdf', createdAt: '2026-01-03T12:00:00.000Z', autorNome: 'Rui' },
      ],
      tarefas: [
        { id: 't1', titulo: 'Pedir registos', createdAt: '2026-01-07T08:00:00.000Z', concluida: false },
      ],
      diligencias: [
        { id: 'g1', titulo: 'Julgamento', dataInicio: '2026-01-08T09:30:00.000Z', local: 'Tribunal de Faro', autorNome: 'Ana' },
      ],
    })

    expect(events.map((e) => e.tipo)).toEqual([
      'diligencia', // 08
      'tarefa', // 07
      'nota', // 06
      'estado', // 05
      'atividade', // 04
      'documento', // 03
      'estado', // 02
      'abertura', // 01
    ])
    // Campos mapeados
    expect(events[0].detalhe).toBe('Tribunal de Faro')
    expect(events[2].titulo).toBe('Nota de investigação') // nota sem título
    expect(events[2].detalhe).toBe('Suspeito identificado.')
    expect(events[3].titulo).toBe('Estado: Em Investigação')
    expect(events[7].detalhe).toBe('Furto')
  })

  test('atividade com quantidade > 1 mostra o multiplicador; tarefa concluída é assinalada', () => {
    const events = mergeTimelineEvents({
      ...EMPTY,
      atividades: [
        { id: 'a1', descricao: 'Pedido de dados', dataRealizacao: '2026-02-01T00:00:00.000Z', quantidade: 4, autorNome: null },
        { id: 'a2', descricao: 'Vigilância', dataRealizacao: '2026-02-02T00:00:00.000Z', quantidade: 1, autorNome: null },
      ],
      tarefas: [
        { id: 't1', titulo: 'Rever auto', createdAt: '2026-02-03T10:00:00.000Z', concluida: true },
      ],
    })
    expect(events.find((e) => e.key === 'atividade:a1')!.titulo).toBe('Pedido de dados ×4')
    expect(events.find((e) => e.key === 'atividade:a2')!.titulo).toBe('Vigilância')
    expect(events.find((e) => e.tipo === 'tarefa')!.detalhe).toBe('Tarefa pessoal — concluída')
  })

  test('motivo da reabertura aparece como detalhe do evento de estado', () => {
    const events = mergeTimelineEvents({
      ...EMPTY,
      estados: [
        { at: '2026-03-01T10:00:00.000Z', estadoNome: 'Reaberto', porNome: 'Coord', motivo: 'Nova prova' },
      ],
    })
    expect(events[0].detalhe).toBe('Nova prova')
    expect(events[0].autorNome).toBe('Coord')
  })

  test('ordem estável em empate de timestamp (desempate pela chave)', () => {
    const at = '2026-04-01T10:00:00.000Z'
    const events = mergeTimelineEvents({
      ...EMPTY,
      notas: [
        { id: 'b', titulo: 'B', conteudo: 'b', createdAt: at, autorNome: 'X' },
        { id: 'a', titulo: 'A', conteudo: 'a', createdAt: at, autorNome: 'X' },
      ],
    })
    expect(events.map((e) => e.key)).toEqual(['nota:a', 'nota:b'])
  })

  test('fontes vazias devolvem lista vazia', () => {
    expect(mergeTimelineEvents(EMPTY)).toEqual([])
  })
})

describe('excerpt', () => {
  test('remove sintaxe Markdown e colapsa espaços', () => {
    expect(excerpt('# Título\n\n**negrito** e [link](https://x.pt) `code`')).toBe(
      'Título negrito e link code',
    )
  })

  test('trunca com reticências no limite', () => {
    const long = 'palavra '.repeat(40)
    const out = excerpt(long, 50)
    expect(out.length).toBeLessThanOrEqual(50)
    expect(out.endsWith('…')).toBe(true)
  })

  test('remove blocos de código inteiros', () => {
    expect(excerpt('antes ```js\nsecret()\n``` depois')).toBe('antes depois')
  })
})

describe('groupEventsByDay', () => {
  test('agrupa eventos consecutivos do mesmo dia local', () => {
    const events = mergeTimelineEvents({
      ...EMPTY,
      notas: [
        { id: 'n1', titulo: 'A', conteudo: 'a', createdAt: '2026-05-02T23:00:00.000Z', autorNome: 'X' },
        { id: 'n2', titulo: 'B', conteudo: 'b', createdAt: '2026-05-02T08:00:00.000Z', autorNome: 'X' },
        { id: 'n3', titulo: 'C', conteudo: 'c', createdAt: '2026-05-01T10:00:00.000Z', autorNome: 'X' },
      ],
    })
    const groups = groupEventsByDay(events)
    expect(groups).toHaveLength(2)
    expect(groups[0].events).toHaveLength(2)
    expect(groups[1].events).toHaveLength(1)
  })
})
