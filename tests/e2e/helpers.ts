import { expect, type Page } from '@playwright/test'

export const ADMIN_EMAIL = 'admin@gpi.pt'
// Tem de coincidir com SEED_PASSWORD usado ao semear a BD de E2E.
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'E2ePassw0rd!seed'

/** Faz login como administrador e espera pelo dashboard. */
export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(ADMIN_EMAIL)
  await page.getByLabel('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL('**/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}
