import { test, expect, type APIRequestContext } from '@playwright/test'
import { login } from './helpers'

/**
 * Página de detalhe do inquérito: cabeçalho com "Editar" + "Ações", painéis
 * vazios ocultos e o menu "Ações" a abrir o formulário do painel (Nota).
 * Os dados (brigada, crime, inquérito) são criados pela API com a sessão do
 * administrador — o seed de E2E só tem estados e o utilizador admin.
 */

async function postJson<T>(request: APIRequestContext, url: string, data: unknown): Promise<T> {
  const res = await request.post(url, { data })
  expect(res.status(), `${url} → ${await res.text()}`).toBe(201)
  return (await res.json()) as T
}

test.describe('Detalhe do inquérito', () => {
  test('painéis vazios ocultos e "Ações → Nota" abre o editor', async ({ page }) => {
    await login(page)
    const request = page.request
    const sufixo = Date.now()

    const brigada = await postJson<{ id: string }>(request, '/api/brigadas', { nome: `E2E Brigada ${sufixo}` })
    const crime = await postJson<{ id: string }>(request, '/api/crimes', { nome: `E2E Crime ${sufixo}` })
    const estados = (await (await request.get('/api/estados-inquerito')).json()) as { id: string; codigo: string }[]
    const aberto = estados.find((e) => e.codigo === 'ABERTO')!
    const nuipc = `${sufixo % 100000}/26.0E2E`
    await postJson(request, '/api/inqueritos', {
      nuipc,
      crimeId: crime.id,
      estadoId: aberto.id,
      brigadaId: brigada.id,
      dataAbertura: new Date().toISOString().slice(0, 10),
    })

    await page.goto(`/inqueritos/${nuipc.replace(/\//g, '~')}`)
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
