import { defineConfig, devices } from '@playwright/test'

/**
 * Configuração E2E (Playwright).
 *
 * Os testes vivem em tests/e2e/*.spec.ts (os testes Vitest usam *.test.ts, pelo
 * que não há sobreposição). Por defeito o Playwright arranca a app com
 * `npm run start` (precisa de `npm run build` antes) e espera por ela.
 *
 * Notas de ambiente:
 *  - O browser (chromium) é descarregado por `npx playwright install chromium`
 *    no CI. Em ambientes onde o download está bloqueado, pode apontar-se a um
 *    executável local via PLAYWRIGHT_CHROMIUM_PATH.
 *  - As credenciais de login do teste vêm de E2E_ADMIN_PASSWORD (o seed deve
 *    ser corrido com SEED_PASSWORD igual).
 */
const PORT = Number(process.env.E2E_PORT ?? 3000)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT: String(PORT) },
  },
})
