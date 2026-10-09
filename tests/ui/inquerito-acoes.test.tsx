// @vitest-environment jsdom
/**
 * Menu "Ações" do inquérito e painéis secundários ocultos quando vazios:
 * o menu só mostra o que o utilizador pode fazer, e cada ação abre o
 * formulário/diálogo do painel dono (mesmo com o painel oculto).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { InqueritoAcoesMenu, type InqueritoAcoesMenuProps } from '@/components/inqueritos/inquerito-acoes-menu'
import { ColaboradoresSection, type ColaboradorItem } from '@/components/inqueritos/colaboradores-section'
import { RelacoesSection } from '@/components/inqueritos/relacoes-section'
import { DeleteInqueritoButton } from '@/components/inqueritos/delete-inquerito-button'
import { dispararAcao } from '@/lib/inquerito-acoes'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const menuProps = (over: Partial<InqueritoAcoesMenuProps> = {}): InqueritoAcoesMenuProps => ({
  slug: '123-26-0JGLSB',
  terminal: false,
  canEdit: true,
  canWork: true,
  podeAdicionarAtividade: true,
  podeAdicionarTarefa: true,
  podeGerirColaboradores: true,
  podeDocumentacaoPendente: true,
  canExport: true,
  canReopen: true,
  canDelete: true,
  modulos: { anexos: true, intercecoes: true, apreensoes: true, pericias: true },
  ...over,
})

async function abrirMenu() {
  await userEvent.click(screen.getByRole('button', { name: /ações/i }))
  // O popup do base-ui monta de forma assíncrona.
  await screen.findAllByRole('menuitem')
}

describe('InqueritoAcoesMenu', () => {
  test('mostra todas as ações permitidas', async () => {
    render(<InqueritoAcoesMenu {...menuProps()} />)
    await abrirMenu()
    for (const label of ['Atividade', 'Tarefa', 'Nota', 'Documento', 'Outro interveniente', 'Ligar inquérito', 'Colaborador', 'Apreensão', 'Exame/Perícia', 'Interceções', 'Exportar CSV', 'Documentação pendente', 'Eliminar inquérito']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeTruthy()
    }
    // Não terminal → sem "Reabrir".
    expect(screen.queryByRole('menuitem', { name: 'Reabrir inquérito' })).toBeNull()
  })

  test('esconde as ações sem permissão', async () => {
    render(
      <InqueritoAcoesMenu
        {...menuProps({ podeGerirColaboradores: false, canDelete: false, canExport: false, terminal: true })}
      />,
    )
    await abrirMenu()
    expect(screen.queryByRole('menuitem', { name: 'Colaborador' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Eliminar inquérito' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Exportar CSV' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Reabrir inquérito' })).toBeTruthy()
  })

  test('sem nenhuma ação permitida não renderiza o botão', () => {
    render(
      <InqueritoAcoesMenu
        {...menuProps({
          canEdit: false, canWork: false, podeAdicionarAtividade: false, podeAdicionarTarefa: false,
          podeGerirColaboradores: false, podeDocumentacaoPendente: false, canExport: false,
          canReopen: false, canDelete: false,
        })}
      />,
    )
    expect(screen.queryByRole('button', { name: /ações/i })).toBeNull()
  })

  test('escolher uma ação dispara o evento para o painel', async () => {
    const recebidas: string[] = []
    const ouvir = (e: Event) => recebidas.push((e as CustomEvent<string>).detail)
    window.addEventListener('gpi:inquerito-acao', ouvir)
    try {
      render(<InqueritoAcoesMenu {...menuProps()} />)
      await abrirMenu()
      await userEvent.click(screen.getByRole('menuitem', { name: 'Colaborador' }))
      expect(recebidas).toEqual(['colaborador'])
    } finally {
      window.removeEventListener('gpi:inquerito-acao', ouvir)
    }
  })
})

const colaborador: ColaboradorItem = {
  id: 'c1',
  motivo: null,
  expiraEm: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  colaborador: { id: 'u2', nome: 'Ana Costa', email: 'ana@pj.pt' },
  concedidoPor: null,
}

describe('ColaboradoresSection', () => {
  test('vazio: painel oculto, a ação abre o diálogo', async () => {
    render(<ColaboradoresSection nuipcSlug="x" colaboradores={[]} inspetoresDisponiveis={[]} podeGerir />)
    expect(screen.queryByText('Colaboradores autorizados')).toBeNull()
    act(() => dispararAcao('colaborador'))
    expect(await screen.findByText('Autorizar colaborador')).toBeTruthy()
  })

  test('com registos: painel visível', () => {
    render(<ColaboradoresSection nuipcSlug="x" colaboradores={[colaborador]} inspetoresDisponiveis={[]} podeGerir={false} />)
    expect(screen.getByText('Ana Costa')).toBeTruthy()
  })

  test('sem permissão: a ação é ignorada', () => {
    render(<ColaboradoresSection nuipcSlug="x" colaboradores={[]} inspetoresDisponiveis={[]} podeGerir={false} />)
    act(() => dispararAcao('colaborador'))
    expect(screen.queryByText('Autorizar colaborador')).toBeNull()
  })
})

describe('RelacoesSection', () => {
  test('vazio fica oculto e aparece em modo "Ligar" ao disparar a ação', async () => {
    render(<RelacoesSection nuipcSlug="x" selfNuipc="1/26.0AAAAA" relacoes={[]} canEdit />)
    expect(screen.queryByText('Inquéritos relacionados')).toBeNull()
    act(() => dispararAcao('relacao'))
    expect(await screen.findByText('Inquéritos relacionados')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^ligar$/i })).toBeTruthy()

    // Cancelar sem ligar nada volta a ocultar o painel.
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText('Inquéritos relacionados')).toBeNull()
  })
})

describe('DeleteInqueritoButton trigger={false}', () => {
  test('não mostra botão e abre a confirmação pela ação', async () => {
    render(<DeleteInqueritoButton nuipc="123/26.0JGLSB" trigger={false} />)
    expect(screen.queryByRole('button', { name: /eliminar/i })).toBeNull()
    act(() => dispararAcao('eliminar'))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo.textContent).toContain('NUIPC 123/26.0JGLSB')
  })
})
