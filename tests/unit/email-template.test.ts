import { describe, test, expect } from 'vitest'
import {
  EMAIL_TEMPLATE_DEFAULTS,
  normalizeEmailTemplate,
  renderEmailSubject,
  renderEmailText,
  renderEmailHtml,
  type EmailTemplate,
} from '@/lib/email-template'

const base: EmailTemplate = { ...EMAIL_TEMPLATE_DEFAULTS }
const content = { titulo: 'Prazo — 1/22', mensagem: 'Linha 1\nLinha 2', appName: 'GPI' }

describe('normalizeEmailTemplate', () => {
  test('null → defaults', () => {
    expect(normalizeEmailTemplate(null)).toEqual(EMAIL_TEMPLATE_DEFAULTS)
  })

  test('parcial → merge com defaults', () => {
    const r = normalizeEmailTemplate({ saudacao: 'Bom dia,', mostrarCabecalho: false })
    expect(r.saudacao).toBe('Bom dia,')
    expect(r.mostrarCabecalho).toBe(false)
    expect(r.rodape).toBe(EMAIL_TEMPLATE_DEFAULTS.rodape)
  })

  test('tipos errados → defaults', () => {
    const r = normalizeEmailTemplate({ mostrarCabecalho: 'sim', corDestaque: 123 })
    expect(r.mostrarCabecalho).toBe(EMAIL_TEMPLATE_DEFAULTS.mostrarCabecalho)
    expect(r.corDestaque).toBe(EMAIL_TEMPLATE_DEFAULTS.corDestaque)
  })

  test('cor inválida cai no default (evita injeção no style)', () => {
    expect(normalizeEmailTemplate({ corDestaque: 'red; } evil' }).corDestaque).toBe(
      EMAIL_TEMPLATE_DEFAULTS.corDestaque,
    )
    expect(normalizeEmailTemplate({ corDestaque: '#abc123' }).corDestaque).toBe('#abc123')
  })
})

describe('renderEmailSubject', () => {
  test('sem prefixo → apenas o título', () => {
    expect(renderEmailSubject({ ...base, assuntoPrefixo: '' }, { titulo: 'X', appName: 'GPI' })).toBe('X')
  })

  test('com prefixo → prefixo + título', () => {
    expect(renderEmailSubject({ ...base, assuntoPrefixo: '[GPI]' }, { titulo: 'X', appName: 'GPI' })).toBe(
      '[GPI] X',
    )
  })

  test('substitui {appName} no prefixo', () => {
    expect(
      renderEmailSubject({ ...base, assuntoPrefixo: '[{appName}]' }, { titulo: 'X', appName: 'PJ' }),
    ).toBe('[PJ] X')
  })
})

describe('renderEmailHtml', () => {
  test('escapa conteúdo (título/mensagem) — anti-injeção', () => {
    const html = renderEmailHtml(base, {
      titulo: '<script>alert(1)</script>',
      mensagem: 'a & b < c',
      appName: 'GPI',
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a &amp; b &lt; c')
  })

  test('converte quebras de linha em <br/>', () => {
    const html = renderEmailHtml(base, content)
    expect(html).toContain('Linha 1<br/>Linha 2')
  })

  test('mostra/oculta o cabeçalho conforme a flag', () => {
    const com = renderEmailHtml({ ...base, mostrarCabecalho: true }, content)
    const sem = renderEmailHtml({ ...base, mostrarCabecalho: false }, content)
    expect(com).toContain('>GPI<')
    // Sem cabeçalho, o nome da app não aparece como faixa (só no rodapé, se lá estiver).
    expect(sem).not.toContain('font-size:18px;font-weight:700;letter-spacing:.3px;')
  })

  test('usa a cor de destaque e ignora cores inválidas', () => {
    expect(renderEmailHtml({ ...base, corDestaque: '#ff0000' }, content)).toContain('#ff0000')
    const evil = renderEmailHtml({ ...base, corDestaque: 'x;}</style>' }, content)
    expect(evil).not.toContain('x;}</style>')
    expect(evil).toContain(EMAIL_TEMPLATE_DEFAULTS.corDestaque)
  })

  test('substitui {appName} nos campos do admin', () => {
    const html = renderEmailHtml({ ...base, rodape: 'Enviado por {appName}.' }, { ...content, appName: 'PJ' })
    expect(html).toContain('Enviado por PJ.')
  })
})

describe('renderEmailText', () => {
  test('inclui título e mensagem em texto simples (sem HTML)', () => {
    const txt = renderEmailText(base, content)
    expect(txt).toContain('Prazo — 1/22')
    expect(txt).toContain('Linha 1\nLinha 2')
    expect(txt).not.toContain('<')
  })
})
