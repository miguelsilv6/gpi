import { describe, test, expect } from 'vitest'
import { buildTourSteps } from '@/lib/tour-steps'

/** Extrai os seletores `element` dos passos (ignora os sem elemento). */
function elements(steps: ReturnType<typeof buildTourSteps>): string[] {
  return steps.map((s) => (typeof s.element === 'string' ? s.element : null)).filter(Boolean) as string[]
}

describe('buildTourSteps', () => {
  test('começa com boas-vindas (sem elemento) e passa pela pesquisa', () => {
    const steps = buildTourSteps('INSPETOR')
    expect(steps.length).toBeGreaterThan(3)
    expect(steps[0].element).toBeUndefined()
    expect(steps[0].popover?.title).toContain('Bem-vindo')
    expect(elements(steps)).toContain('[data-tour="global-search"]')
  })

  test('termina no menu de utilizador e inclui as notificações', () => {
    const steps = buildTourSteps('INSPETOR')
    const els = elements(steps)
    expect(els).toContain('[data-tour="notifications"]')
    expect(steps[steps.length - 1].element).toBe('[data-tour="user-menu"]')
  })

  test('INSPETOR não vê passos de administração', () => {
    const els = elements(buildTourSteps('INSPETOR'))
    expect(els).toContain('[data-tour="nav:/inqueritos"]')
    expect(els).not.toContain('[data-tour="nav:/utilizadores"]')
    expect(els).not.toContain('[data-tour="nav:/configuracoes"]')
  })

  test('ADMINISTRACAO vê os passos de administração', () => {
    const els = elements(buildTourSteps('ADMINISTRACAO'))
    expect(els).toContain('[data-tour="nav:/utilizadores"]')
    expect(els).toContain('[data-tour="nav:/configuracoes"]')
  })

  test('um módulo desativado remove o respetivo passo (INSPETOR)', () => {
    const comIntercecoes = elements(buildTourSteps('INSPETOR', { moduloIntercecoesAtivo: true }))
    const semIntercecoes = elements(buildTourSteps('INSPETOR', { moduloIntercecoesAtivo: false }))
    expect(comIntercecoes).toContain('[data-tour="nav:/intercecoes"]')
    expect(semIntercecoes).not.toContain('[data-tour="nav:/intercecoes"]')
  })

  test('todos os passos com elemento têm popover com título e descrição', () => {
    for (const s of buildTourSteps('COORDENADOR')) {
      expect(s.popover?.title).toBeTruthy()
      expect(s.popover?.description).toBeTruthy()
    }
  })
})
