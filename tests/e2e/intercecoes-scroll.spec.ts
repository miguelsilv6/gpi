import { test, expect } from '@playwright/test'
import { login, criarInquerito, postJson } from './helpers'

/**
 * Regressão: na página de interceções, ao descer até ao fundo, a página toda
 * subia e aparecia uma faixa vazia (preta no tema escuro). Causa: cabeçalhos
 * `sr-only` (position: absolute) das tabelas posicionavam-se em relação à
 * janela, escapavam ao scroll do <main> e esticavam o documento. O documento
 * nunca deve ser mais alto do que a janela — só o <main> faz scroll.
 */
test('Controlo de interceções: só o <main> faz scroll (sem faixa no fundo)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 })
  await login(page)
  const { slug } = await criarInquerito(page)

  const base = `/api/inqueritos/${encodeURIComponent(slug)}/intercecoes`
  const alvo = await postJson<{ id: string }>(page.request, base, { nome: 'Alvo E2E' }, 200)
  await postJson(page.request, `${base}/alvos/${alvo.id}/linhas`, {
    codigo: '1A',
    tipo: 'SIM',
    identificador: '912345678',
    dataInicio: '2026-01-01',
    dataFim: '2026-03-01',
  }, 200)

  await page.goto(`/inqueritos/${slug}/intercecoes`)
  await expect(page.getByText('912345678').first()).toBeVisible()

  await page.locator('main').evaluate((m) => m.scrollTo(0, m.scrollHeight))
  const { doc, janela } = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight,
    janela: window.innerHeight,
  }))
  expect(doc).toBeLessThanOrEqual(janela)
})
