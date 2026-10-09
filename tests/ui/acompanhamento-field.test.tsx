// @vitest-environment jsdom
/**
 * "Acompanhado até" do alvo (interceções): o botão "Agora" abre um pop-up de
 * confirmação (e só guarda ao confirmar); escrever à mão usa "Guardar" com
 * validação do formato; depois de guardar pergunta se marca os produtos como
 * ouvidos. Interação real com fetch/router mockados.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AcompanhamentoField } from '@/components/intercecoes/intercecoes-view'

const BASE = '/api/inqueritos/123-26-0JGLSB/intercecoes'
const fetchMock = vi.fn()
const onSaved = vi.fn()

/** Responde ao PUT do alvo com `produtosPorMarcar` e ao POST marcar-ouvidos. */
function mockApi(produtosPorMarcar: number) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return { ok: true, json: async () => ({ id: 'a1', produtosPorMarcar }) }
    if (init?.method === 'POST') return { ok: true, json: async () => ({ marcados: produtosPorMarcar }) }
    return { ok: true, json: async () => ({}) }
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  onSaved.mockReset()
  mockApi(0)
  vi.stubGlobal('fetch', fetchMock)
  // Só a Date é falseada (os timers reais mantêm o user-event/async a funcionar).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 9, 14, 5, 30)) // 09-10-2026 14:05:30 (hora local)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const putCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')
const postCalls = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')

function renderField(props: { initialAte?: string; canEdit?: boolean } = {}) {
  return render(
    <AcompanhamentoField
      base={BASE}
      alvoId="a1"
      initial=""
      initialAte={props.initialAte ?? ''}
      canEdit={props.canEdit ?? true}
      onSaved={onSaved}
    />,
  )
}

describe('Acompanhado até — botão "Agora"', () => {
  test('abre o pop-up com a data/hora atual (dd-mm-aaaa hh:mm:ss) e não guarda ainda', async () => {
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole('button', { name: 'Agora' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Confirmar acompanhamento?')).toBeTruthy()
    expect(within(dialog).getByText('09-10-2026 14:05:30')).toBeTruthy()
    expect(putCalls()).toHaveLength(0)
    // "Agora" já não preenche o campo nem faz aparecer o botão Guardar.
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull()
  })

  test('Cancelar fecha o pop-up sem guardar', async () => {
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole('button', { name: 'Agora' }))
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByText('Confirmar acompanhamento?')).toBeNull())
    expect(putCalls()).toHaveLength(0)
  })

  test('Confirmar guarda diretamente (PUT acompanhadoAte) sem usar o botão Guardar', async () => {
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole('button', { name: 'Agora' }))
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(putCalls()).toHaveLength(1))
    const [url, init] = putCalls()[0]
    expect(url).toBe(`${BASE}/alvos/a1`)
    expect(JSON.parse(init.body)).toEqual({ acompanhadoAte: '09-10-2026 14:05:30' })
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Confirmar acompanhamento?')).toBeNull())
  })
})

describe('Acompanhado até — escrita manual', () => {
  test('formato inválido: mostra aviso e não deixa guardar', async () => {
    const user = userEvent.setup()
    renderField()

    await user.type(screen.getByLabelText('Acompanhado até'), '31-02-2026 10:00:00')

    expect(screen.getByText('Formato: dd-mm-aaaa hh:mm:ss')).toBeTruthy()
    const guardar = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement
    expect(guardar.disabled).toBe(true)
    expect(putCalls()).toHaveLength(0)
  })

  test('formato válido: Guardar envia o valor escrito', async () => {
    const user = userEvent.setup()
    renderField()

    await user.type(screen.getByLabelText('Acompanhado até'), '01-02-2026 08:30:00')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(putCalls()).toHaveLength(1))
    expect(JSON.parse(putCalls()[0][1].body)).toEqual({ acompanhadoAte: '01-02-2026 08:30:00' })
  })

  test('sem permissão de edição: mostra o valor e nenhum controlo', () => {
    renderField({ initialAte: '01-02-2026 08:30:00', canEdit: false })

    expect(screen.getByText('01-02-2026 08:30:00')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Agora' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull()
  })
})

describe('Acompanhado até — marcar produtos como ouvidos', () => {
  test('sem produtos por marcar: não pergunta nada', async () => {
    mockApi(0)
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole('button', { name: 'Agora' }))
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(putCalls()).toHaveLength(1))
    await waitFor(() => expect(screen.queryByText('Confirmar acompanhamento?')).toBeNull())
    expect(screen.queryByText('Marcar produtos como ouvidos?')).toBeNull()
  })

  test('com produtos por marcar: pergunta; "Sim, marcar" faz POST marcar-ouvidos', async () => {
    mockApi(3)
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole('button', { name: 'Agora' }))
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }))

    const dialog = await screen.findByText('Marcar produtos como ouvidos?')
    expect(dialog).toBeTruthy()
    expect(screen.getByText('3', { selector: 'strong' })).toBeTruthy()
    expect(postCalls()).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Sim, marcar' }))

    await waitFor(() => expect(postCalls()).toHaveLength(1))
    expect(postCalls()[0][0]).toBe(`${BASE}/alvos/a1/marcar-ouvidos`)
    await waitFor(() => expect(screen.queryByText('Marcar produtos como ouvidos?')).toBeNull())
  })

  test('"Não, só guardar" não marca nenhum produto', async () => {
    mockApi(2)
    const user = userEvent.setup()
    renderField()

    await user.click(screen.getByRole('button', { name: 'Agora' }))
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }))
    await user.click(await screen.findByRole('button', { name: 'Não, só guardar' }))

    await waitFor(() => expect(screen.queryByText('Marcar produtos como ouvidos?')).toBeNull())
    expect(postCalls()).toHaveLength(0)
  })
})
