import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const ADMIN_EMAIL = 'admin@gpi.pt'
// Tem de coincidir com SEED_PASSWORD usado ao semear a BD de E2E.
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'E2ePassw0rd!seed'

/** Faz login como administrador e espera pelo dashboard. */
export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(ADMIN_EMAIL)
  await page.getByLabel('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForURL('**/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

/** POST JSON com a sessão da página; falha o teste se o estado não for o esperado. */
export async function postJson<T>(
  request: APIRequestContext,
  url: string,
  data: unknown,
  status = 201,
): Promise<T> {
  const res = await request.post(url, { data })
  expect(res.status(), `${url} → ${await res.text()}`).toBe(status)
  return (await res.json()) as T
}

/**
 * Cria brigada, crime e um inquérito ABERTO pela API (o seed de E2E só tem
 * estados e o admin). Devolve o NUIPC e o slug para a URL.
 */
export async function criarInquerito(page: Page): Promise<{ nuipc: string; slug: string }> {
  const request = page.request
  const sufixo = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const brigada = await postJson<{ id: string }>(request, '/api/brigadas', { nome: `E2E Brigada ${sufixo}` })
  const crime = await postJson<{ id: string }>(request, '/api/crimes', { nome: `E2E Crime ${sufixo}` })
  const estados = (await (await request.get('/api/estados-inquerito')).json()) as { id: string; codigo: string }[]
  const aberto = estados.find((e) => e.codigo === 'ABERTO')!
  const nuipc = `${Number(sufixo) % 100000}/26.0E2E`
  await postJson(request, '/api/inqueritos', {
    nuipc,
    crimeId: crime.id,
    estadoId: aberto.id,
    brigadaId: brigada.id,
    dataAbertura: new Date().toISOString().slice(0, 10),
  })
  return { nuipc, slug: nuipc.replace(/\//g, '~') }
}
