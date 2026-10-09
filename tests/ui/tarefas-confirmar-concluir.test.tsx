// @vitest-environment jsdom
/**
 * Concluir uma tarefa pede confirmação (página Tarefas e secção do inquérito);
 * reabrir é imediato. Interação real (cliques) com fetch/router mockados.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { TarefasBrowser, type TarefaBrowserItem } from '@/components/tarefas/tarefas-browser'
import { TarefasSection, type TarefaItem } from '@/components/inqueritos/tarefas-section'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const patchCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')

const browserItem = (over: Partial<TarefaBrowserItem> = {}): TarefaBrowserItem => ({
  id: 't1',
  titulo: 'Pedir extrato bancário',
  descricao: null,
  prioridade: 'NORMAL',
  concluida: false,
  concluidaEm: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  inquerito: { nuipc: '123/26.0JGLSB', slug: '123-26-0JGLSB', natureza: 'Burla', cartaPrecatoria: false },
  ...over,
})

const secaoItem = (over: Partial<TarefaItem> = {}): TarefaItem => ({
  id: 't1',
  titulo: 'Pedir extrato bancário',
  descricao: null,
  prioridade: 'NORMAL',
  concluida: false,
  concluidaEm: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  ...over,
})

describe('Tarefas (página) — confirmar ao concluir', () => {
  test('clicar em concluir abre a confirmação e NÃO chama a API ainda', async () => {
    const user = userEvent.setup()
    render(<TarefasBrowser tarefas={[browserItem()]} />)

    await user.click(screen.getByTitle('Marcar como concluída'))

    expect(await screen.findByText('Concluir tarefa?')).toBeTruthy()
    expect(screen.getByText('Pedir extrato bancário', { selector: 'strong' })).toBeTruthy()
    expect(patchCalls()).toHaveLength(0)
  })

  test('Cancelar fecha a confirmação sem concluir', async () => {
    const user = userEvent.setup()
    render(<TarefasBrowser tarefas={[browserItem()]} />)

    await user.click(screen.getByTitle('Marcar como concluída'))
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByText('Concluir tarefa?')).toBeNull())
    expect(patchCalls()).toHaveLength(0)
  })

  test('Concluir confirma e envia PATCH { concluida: true }', async () => {
    const user = userEvent.setup()
    render(<TarefasBrowser tarefas={[browserItem()]} />)

    await user.click(screen.getByTitle('Marcar como concluída'))
    await user.click(await screen.findByRole('button', { name: 'Concluir' }))

    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    const [url, init] = patchCalls()[0]
    expect(url).toBe('/api/tarefas/t1')
    expect(JSON.parse(init.body)).toEqual({ concluida: true })
    await waitFor(() => expect(screen.queryByText('Concluir tarefa?')).toBeNull())
  })

  test('reabrir uma tarefa concluída é imediato (sem confirmação)', async () => {
    const user = userEvent.setup()
    render(<TarefasBrowser tarefas={[browserItem({ concluida: true, concluidaEm: '2026-06-02T10:00:00.000Z' })]} />)

    await user.click(screen.getByRole('button', { name: /Concluídas \(1\)/ }))
    await user.click(await screen.findByTitle('Reabrir tarefa'))

    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    expect(JSON.parse(patchCalls()[0][1].body)).toEqual({ concluida: false })
    expect(screen.queryByText('Concluir tarefa?')).toBeNull()
  })
})

describe('Tarefas (secção do inquérito) — confirmar ao concluir', () => {
  test('pede confirmação e só conclui ao confirmar', async () => {
    const user = userEvent.setup()
    render(<TarefasSection nuipcSlug="123-26-0JGLSB" tarefas={[secaoItem()]} canAdd />)

    await user.click(screen.getByTitle('Marcar como concluída'))
    expect(await screen.findByText('Concluir tarefa?')).toBeTruthy()
    expect(patchCalls()).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Concluir' }))
    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    expect(JSON.parse(patchCalls()[0][1].body)).toEqual({ concluida: true })
  })

  test('Cancelar não conclui', async () => {
    const user = userEvent.setup()
    render(<TarefasSection nuipcSlug="123-26-0JGLSB" tarefas={[secaoItem()]} canAdd />)

    await user.click(screen.getByTitle('Marcar como concluída'))
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByText('Concluir tarefa?')).toBeNull())
    expect(patchCalls()).toHaveLength(0)
  })

  test('reabrir é imediato', async () => {
    const user = userEvent.setup()
    render(
      <TarefasSection
        nuipcSlug="123-26-0JGLSB"
        tarefas={[secaoItem({ concluida: true, concluidaEm: '2026-06-02T10:00:00.000Z' })]}
        canAdd
      />,
    )

    await user.click(await screen.findByTitle('Reabrir tarefa'))

    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    expect(JSON.parse(patchCalls()[0][1].body)).toEqual({ concluida: false })
    expect(screen.queryByText('Concluir tarefa?')).toBeNull()
  })
})
