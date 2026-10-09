import { test, expect } from '@playwright/test'
import { login, criarInquerito } from './helpers'

/**
 * Página de detalhe do inquérito: cabeçalho com "Editar" + "Ações", painéis
 * vazios ocultos e o menu "Ações" a abrir o formulário do painel (Nota).
 * Os dados (brigada, crime, inquérito) são criados pela API com a sessão do
 * administrador — o seed de E2E só tem estados e o utilizador admin.
 */

test.describe('Detalhe do inquérito', () => {
  test('painéis vazios ocultos e "Ações → Nota" abre o editor', async ({ page }) => {
    await login(page)
    const { nuipc, slug } = await criarInquerito(page)

    await page.goto(`/inqueritos/${slug}`)
    await expect(page.getByText(nuipc).first()).toBeVisible()

    // Cabeçalho: só "Editar" + "Ações".
    await expect(page.getByRole('button', { name: 'Ações', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Editar', exact: true })).toBeVisible()

    // Painéis vazios não aparecem.
    for (const titulo of ['Colaboradores autorizados', 'Inquéritos relacionados', 'Notas de investigação']) {
      await expect(page.getByText(titulo, { exact: true })).toHaveCount(0)
    }

    // "Ações → Nota" mostra o painel em modo de escrita.
    await page.getByRole('button', { name: 'Ações', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Nota', exact: true }).click()
    await expect(page.getByText('Notas de investigação', { exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Título (opcional)')).toBeVisible()
  })
})
