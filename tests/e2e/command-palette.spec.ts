import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Paleta de comandos (Cmd+K)', () => {
  test('abre com Ctrl+K e navega por atalho', async ({ page }) => {
    await login(page)

    // Abre a paleta pelo atalho de teclado.
    await page.keyboard.press('Control+k')

    const input = page.getByPlaceholder(/Pesquisar inquéritos/)
    await expect(input).toBeVisible()

    // "Configura" filtra para o atalho de navegação "Configurações" (admin).
    // Enter seleciona o item realçado (o único), navegando para a página.
    await input.fill('Configura')
    await page.keyboard.press('Enter')

    await page.waitForURL('**/configuracoes')
    await expect(page).toHaveURL(/\/configuracoes/)
  })

  test('fecha com Escape', async ({ page }) => {
    await login(page)
    await page.keyboard.press('Control+k')
    const input = page.getByPlaceholder(/Pesquisar inquéritos/)
    await expect(input).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(input).toBeHidden()
  })
})
