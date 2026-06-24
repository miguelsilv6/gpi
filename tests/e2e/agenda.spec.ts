import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('Agenda', () => {
  test('abre com o calendário e o botão de nova diligência', async ({ page }) => {
    await login(page)
    await page.goto('/agenda')
    await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible()
    // O módulo está ativo por defeito e o admin pode criar diligências — se a
    // CSP/nonce bloqueasse os scripts, o botão (client) não renderizaria.
    await expect(page.getByRole('button', { name: 'Nova diligência' })).toBeVisible()
  })
})
