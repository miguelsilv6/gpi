'use client'

import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ChevronDown,
  ClipboardList,
  CheckSquare,
  StickyNote,
  Paperclip,
  Users,
  Link2,
  UserPlus,
  Boxes,
  Microscope,
  RadioTower,
  Download,
  FileDown,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { dispararAcao, type AcaoInquerito } from '@/lib/inquerito-acoes'

export interface InqueritoAcoesMenuProps {
  slug: string
  terminal: boolean
  /** Pode editar o inquérito (intervenientes, ligações, doc. pendente). */
  canEdit: boolean
  /** Pode trabalhar no inquérito (titular, hierarquia ou colaborador). */
  canWork: boolean
  podeAdicionarAtividade: boolean
  podeAdicionarTarefa: boolean
  podeGerirColaboradores: boolean
  podeDocumentacaoPendente: boolean
  canExport: boolean
  canReopen: boolean
  canDelete: boolean
  modulos: { anexos: boolean; intercecoes: boolean; apreensoes: boolean; pericias: boolean }
}

interface Item {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  onSelect: () => void
  destrutivo?: boolean
}

/** Menu "Ações" do cabeçalho do inquérito: só mostra o que o utilizador pode fazer. */
export function InqueritoAcoesMenu(p: InqueritoAcoesMenuProps) {
  const router = useRouter()
  const acao = (a: AcaoInquerito) => () => dispararAcao(a)
  const base = `/inqueritos/${p.slug}`

  const adicionar: Item[] = []
  if (p.podeAdicionarAtividade) adicionar.push({ key: 'atividade', label: 'Atividade', icon: ClipboardList, onSelect: () => router.push(`${base}/atividade`) })
  if (p.podeAdicionarTarefa) adicionar.push({ key: 'tarefa', label: 'Tarefa', icon: CheckSquare, onSelect: acao('tarefa') })
  if (p.canWork) adicionar.push({ key: 'nota', label: 'Nota', icon: StickyNote, onSelect: acao('nota') })
  if (p.canWork && p.modulos.anexos) adicionar.push({ key: 'documento', label: 'Documento', icon: Paperclip, onSelect: acao('documento') })
  if (p.canEdit) adicionar.push({ key: 'interveniente', label: 'Outro interveniente', icon: Users, onSelect: acao('interveniente') })
  if (p.canEdit) adicionar.push({ key: 'relacao', label: 'Ligar inquérito', icon: Link2, onSelect: acao('relacao') })
  if (p.podeGerirColaboradores) adicionar.push({ key: 'colaborador', label: 'Colaborador', icon: UserPlus, onSelect: acao('colaborador') })
  if (p.canWork && p.modulos.apreensoes) adicionar.push({ key: 'apreensao', label: 'Apreensão', icon: Boxes, onSelect: acao('apreensao') })
  if (p.canWork && p.modulos.pericias) adicionar.push({ key: 'pericia', label: 'Exame/Perícia', icon: Microscope, onSelect: acao('pericia') })
  if (p.canWork && p.modulos.intercecoes) adicionar.push({ key: 'intercecoes', label: 'Interceções', icon: RadioTower, onSelect: () => router.push(`${base}/intercecoes`) })

  const exportar: Item[] = []
  if (p.canExport) {
    exportar.push({
      key: 'csv',
      label: 'Exportar CSV',
      icon: Download,
      onSelect: () => {
        // Descarga de um route handler (/api/...), não uma página do Next.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/api/inqueritos/${p.slug}/export?format=csv`)
      },
    })
    exportar.push({ key: 'pdf', label: 'Versão para imprimir / PDF', icon: FileDown, onSelect: () => { window.open(`${base}/print`, '_blank', 'noopener') } })
  }

  const inquerito: Item[] = []
  if (p.podeDocumentacaoPendente) inquerito.push({ key: 'doc', label: 'Documentação pendente', icon: Paperclip, onSelect: acao('documentacao-pendente') })
  if (p.canReopen && p.terminal) inquerito.push({ key: 'reabrir', label: 'Reabrir inquérito', icon: RotateCcw, onSelect: acao('reabrir') })
  if (p.canDelete) inquerito.push({ key: 'eliminar', label: 'Eliminar inquérito', icon: Trash2, onSelect: acao('eliminar'), destrutivo: true })

  const grupos = [
    { titulo: 'Adicionar', itens: adicionar },
    { titulo: 'Exportar', itens: exportar },
    { titulo: 'Inquérito', itens: inquerito },
  ].filter((g) => g.itens.length > 0)

  if (grupos.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent">
        Ações
        <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {grupos.map((g, gi) => (
          <div key={g.titulo}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{g.titulo}</DropdownMenuLabel>
              {g.itens.map((it) => (
                <DropdownMenuItem
                  key={it.key}
                  onClick={it.onSelect}
                  variant={it.destrutivo ? 'destructive' : 'default'}
                >
                  <it.icon className="h-4 w-4" />
                  {it.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
