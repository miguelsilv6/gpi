/**
 * Cronologia unificada do inquérito — render estático (env node, sem DOM).
 * Foco: agrupamento por dia, ordem, conteúdo escapado e o corte em <details>
 * para inquéritos longos.
 */
import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CronologiaSection } from '@/components/inqueritos/cronologia-section'
import { mergeTimelineEvents, type TimelineSources } from '@/lib/inquerito-timeline'

const EMPTY: TimelineSources = {
  abertura: null,
  estados: [],
  atividades: [],
  notas: [],
  documentos: [],
  tarefas: [],
  diligencias: [],
}

describe('CronologiaSection', () => {
  test('sem eventos não renderiza nada', () => {
    expect(renderToStaticMarkup(<CronologiaSection events={[]} />)).toBe('')
  })

  test('renderiza eventos com título, tipo e autor; conteúdo do utilizador escapado', () => {
    const events = mergeTimelineEvents({
      ...EMPTY,
      abertura: { dataAbertura: '2026-01-01T00:00:00.000Z', crimeNome: 'Furto' },
      notas: [
        {
          id: 'n1',
          titulo: '<script>alert(1)</script>',
          conteudo: 'corpo',
          createdAt: '2026-01-02T10:00:00.000Z',
          autorNome: 'Ana',
        },
      ],
    })
    const html = renderToStaticMarkup(<CronologiaSection events={events} />)
    expect(html).toContain('Cronologia')
    expect(html).toContain('Inquérito aberto')
    expect(html).toContain('por Ana')
    // Escapado pelo React — nunca injetado como tag.
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('mais de 10 dias → o excedente fica dentro de <details>', () => {
    const notas = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      titulo: `Nota ${i}`,
      conteudo: 'x',
      createdAt: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
      autorNome: 'Ana',
    }))
    const events = mergeTimelineEvents({ ...EMPTY, notas })
    const html = renderToStaticMarkup(<CronologiaSection events={events} />)
    expect(html).toContain('<details')
    expect(html).toContain('Mostrar mais 2 eventos')
  })

  test('até 10 dias → sem <details>', () => {
    const events = mergeTimelineEvents({
      ...EMPTY,
      notas: [
        { id: 'n1', titulo: 'Só uma', conteudo: 'x', createdAt: '2026-03-01T10:00:00.000Z', autorNome: 'Ana' },
      ],
    })
    const html = renderToStaticMarkup(<CronologiaSection events={events} />)
    expect(html).not.toContain('<details')
  })
})
