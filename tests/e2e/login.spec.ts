import { test, expect } from '@playwright/test'
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers'

test.describe('Autenticação', () => {
  test('rejeita credenciais inválidas', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(ADMIN_EMAIL)
    await page.getByLabel('Password').fill('password-errada')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByText('Email ou password incorretos.')).toBeVisible()
  })

  test('login válido redireciona para o dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(ADMIN_EMAIL)
    await page.getByLabel('Password').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.waitForURL('**/dashboard')
    // Se a CSP (nonce) bloqueasse os scripts, a app não hidratava e o
    // formulário não submetia — este teste cobre também esse caminho.
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    // admin é "chefe ou superior" → o dashboard mostra os 8 contadores das
    // Estatísticas (o card "Arquivados" só existe nessa vista alargada).
    await expect(page.getByText('Arquivados')).toBeVisible()
  })

  test('rota protegida sem sessão é redirecionada para /login', async ({ page }) => {
    await page.goto('/inqueritos')
    await page.waitForURL('**/login**')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  })
})
