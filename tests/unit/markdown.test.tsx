/**
 * Testes do renderizador de Markdown leve (`@/components/ui/markdown`).
 *
 * Foco: segurança (HTML do utilizador é escapado, nunca injetado) e cobertura
 * do subconjunto suportado (títulos, formatação inline, listas, tarefas,
 * citações, código, links). Renderiza para markup estático (env node) sem
 * necessitar de DOM.
 */
import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '@/components/ui/markdown'

function render(content: string): string {
  return renderToStaticMarkup(<Markdown content={content} />)
}

describe('Markdown — segurança', () => {
  test('escapa HTML embutido em vez de o injetar', () => {
    const html = render('Olá <script>alert(1)</script> & <b>bold</b>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    // O "&" do texto é escapado para entidade.
    expect(html).toContain('&amp;')
  })

  test('só aceita links http(s)', () => {
    const html = render('[x](javascript:alert(1))')
    // Esquema não-http não corresponde à regra de link → fica como texto.
    expect(html).not.toContain('href="javascript')
  })

  test('renderiza link http com rel de segurança', () => {
    const html = render('[site](https://exemplo.pt)')
    expect(html).toContain('href="https://exemplo.pt"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})

describe('Markdown — blocos', () => {
  test('títulos # ## ###', () => {
    expect(render('# Um')).toContain('<h3')
    expect(render('## Dois')).toContain('<h4')
    expect(render('### Três')).toContain('<h5')
  })

  test('negrito, itálico, rasurado e código inline', () => {
    expect(render('**a**')).toContain('<strong>')
    expect(render('*a*')).toContain('<em>')
    expect(render('~~a~~')).toContain('<del>')
    expect(render('`a`')).toContain('<code')
  })

  test('lista com marcadores e numerada', () => {
    expect(render('- um\n- dois')).toContain('<ul')
    expect(render('1. um\n2. dois')).toContain('<ol')
  })

  test('lista de tarefas com checkbox', () => {
    const html = render('- [x] feito\n- [ ] por fazer')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked')
  })

  test('citação e bloco de código', () => {
    expect(render('> citação')).toContain('<blockquote')
    expect(render('```\ncodigo\n```')).toContain('<pre')
  })

  test('linha horizontal', () => {
    expect(render('---')).toContain('<hr')
  })
})
