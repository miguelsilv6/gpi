'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Markdown } from '@/components/ui/markdown'
import { NotaEditor } from '@/components/inqueritos/nota-editor'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import {
  CheckSquare,
  Circle,
  CheckCircle2,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  X,
  Send,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import type { PrioridadeTarefa } from '@/generated/prisma/enums'
import { PRIORIDADE_LABEL, PRIORIDADE_COLOR } from '@/components/tarefas/tarefa-shared'

export interface TarefaItem {
  id: string
  titulo: string
  descricao: string | null
  prioridade: PrioridadeTarefa
  concluida: boolean
  concluidaEm: string | null
  createdAt: string
}

interface Props {
  nuipcSlug: string
  tarefas: TarefaItem[]
  canAdd: boolean
}

export function TarefasSection({ nuipcSlug, tarefas, canAdd }: Props) {
  const router = useRouter()

  const [composing, setComposing] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>('NORMAL')
  const [saving, setSaving] = useState(false)

  const [editing, setEditing] = useState<TarefaItem | null>(null)
  const [editTitulo, setEditTitulo] = useState('')
  const [editDescricao, setEditDescricao] = useState('')
  const [editPrioridade, setEditPrioridade] = useState<PrioridadeTarefa>('NORMAL')

  const [toDelete, setToDelete] = useState<TarefaItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [showConcluidas, setShowConcluidas] = useState(false)

  function resetCompose() {
    setComposing(false)
    setTitulo('')
    setDescricao('')
    setPrioridade('NORMAL')
  }

  async function handleAdd() {
    if (!titulo.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/inqueritos/${nuipcSlug}/tarefas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: titulo.trim(), descricao: descricao.trim() || undefined, prioridade }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao criar a tarefa')
        return
      }
      toast.success('Tarefa criada')
      resetCompose()
      router.refresh()
    } catch {
      toast.error('Erro de rede ao criar a tarefa')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(t: TarefaItem) {
    setToggling(t.id)
    try {
      const res = await fetch(`/api/tarefas/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concluida: !t.concluida }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao atualizar a tarefa')
        return
      }
      router.refresh()
    } catch {
      toast.error('Erro de rede ao atualizar a tarefa')
    } finally {
      setToggling(null)
    }
  }

  function startEdit(t: TarefaItem) {
    setEditing(t)
    setEditTitulo(t.titulo)
    setEditDescricao(t.descricao ?? '')
    setEditPrioridade(t.prioridade)
  }

  async function handleSaveEdit() {
    if (!editing || !editTitulo.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tarefas/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: editTitulo.trim(),
          descricao: editDescricao.trim() || null,
          prioridade: editPrioridade,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar a tarefa')
        return
      }
      toast.success('Tarefa atualizada')
      setEditing(null)
      router.refresh()
    } catch {
      toast.error('Erro de rede ao guardar a tarefa')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/tarefas/${toDelete.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao eliminar a tarefa')
        return
      }
      toast.success('Tarefa eliminada')
      setToDelete(null)
      router.refresh()
    } catch {
      toast.error('Erro de rede ao eliminar a tarefa')
    } finally {
      setDeleting(false)
    }
  }

  const pendentes = tarefas.filter((t) => !t.concluida)
  const concluidas = tarefas.filter((t) => t.concluida)
  // Abre as concluídas automaticamente quando não há pendentes.
  const effectiveShowConcluidas = showConcluidas || pendentes.length === 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckSquare className="h-4 w-4" />
          Tarefas
          {pendentes.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({pendentes.length} pendente{pendentes.length !== 1 ? 's' : ''})</span>
          )}
        </CardTitle>
        <HelpButton title="Ajuda — Tarefas">
          <HelpSection title="Tarefas pessoais">
            <p>As tarefas são pessoais — só você as vê e pode agir nelas. Use-as para gerir o que falta fazer neste inquérito.</p>
          </HelpSection>
          <HelpSection title="Criar uma tarefa">
            <p>Clique em <strong>Nova tarefa</strong>, preencha o título (obrigatório), adicione uma descrição opcional com Markdown e escolha a prioridade. Prima <strong>Criar</strong> para guardar.</p>
          </HelpSection>
          <HelpSection title="Concluir e reabrir">
            <p>Clique no círculo à esquerda para marcar como concluída. Clique novamente para reabrir.</p>
          </HelpSection>
          <HelpSection title="Página de Tarefas">
            <p>A página <strong>Tarefas</strong> no menu lateral reúne todas as suas tarefas pendentes, de todos os inquéritos, filtráveis por prioridade e estado.</p>
          </HelpSection>
        </HelpButton>
      </CardHeader>

      <CardContent className="space-y-3">
        {canAdd && (
          composing ? (
            <div className="space-y-2 rounded-lg border bg-muted/10 p-3">
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={200}
                placeholder="Título da tarefa"
                className="font-medium"
                autoFocus
                onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAdd() }}
              />
              <NotaEditor value={descricao} onChange={setDescricao} minRows={3} placeholder="Descrição (opcional, suporta Markdown)…" />
              <div className="flex items-center gap-2">
                <PrioridadeSelector value={prioridade} onChange={setPrioridade} />
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={resetCompose} disabled={saving}>Cancelar</Button>
                  <Button size="sm" className="gap-1.5" disabled={saving || !titulo.trim()} onClick={handleAdd}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Criar
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setComposing(true)}>
              <Plus className="h-3.5 w-3.5" /> Nova tarefa
            </Button>
          )
        )}

        {tarefas.length === 0 && (
          <p className="text-sm text-muted-foreground py-1">Sem tarefas registadas.</p>
        )}

        {pendentes.length > 0 && (
          <ul className="space-y-1.5">
            {pendentes.map((t) => <TarefaRow key={t.id} t={t} toggling={toggling} onToggle={handleToggle} onEdit={startEdit} onDelete={setToDelete} />)}
          </ul>
        )}

        {concluidas.length > 0 && (
          <details
            className="group"
            open={effectiveShowConcluidas}
            onToggle={(e) => setShowConcluidas((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer select-none text-xs text-muted-foreground py-1 list-none flex items-center gap-1">
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-0 -rotate-90" />
              {concluidas.length} concluída{concluidas.length !== 1 ? 's' : ''}
            </summary>
            <ul className="mt-1.5 space-y-1.5">
              {concluidas.map((t) => <TarefaRow key={t.id} t={t} toggling={toggling} onToggle={handleToggle} onEdit={startEdit} onDelete={setToDelete} />)}
            </ul>
          </details>
        )}
      </CardContent>

      {/* Diálogo de edição */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" /> Editar tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} maxLength={200} placeholder="Título" className="font-medium" />
            <NotaEditor value={editDescricao} onChange={setEditDescricao} minRows={3} placeholder="Descrição (opcional)…" />
            <PrioridadeSelector value={editPrioridade} onChange={setEditPrioridade} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving} className="gap-1.5">
              <X className="h-4 w-4" /> Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editTitulo.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de eliminação */}
      <Dialog open={!!toDelete} onOpenChange={(v) => { if (!v) setToDelete(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Eliminar tarefa?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação é permanente e não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function TarefaRow({
  t,
  toggling,
  onToggle,
  onEdit,
  onDelete,
}: {
  t: TarefaItem
  toggling: string | null
  onToggle: (t: TarefaItem) => void
  onEdit: (t: TarefaItem) => void
  onDelete: (t: TarefaItem) => void
}) {
  return (
    <li className={`rounded-lg border px-3 py-2 ${t.concluida ? 'bg-muted/10 opacity-70' : 'bg-muted/20'}`}>
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
          title={t.concluida ? 'Reabrir tarefa' : 'Marcar como concluída'}
          onClick={() => onToggle(t)}
          disabled={toggling === t.id}
        >
          {toggling === t.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : t.concluida ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium break-words ${t.concluida ? 'line-through text-muted-foreground' : ''}`}>
            {t.titulo}
            <span className={`ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${PRIORIDADE_COLOR[t.prioridade]}`}>
              {PRIORIDADE_LABEL[t.prioridade]}
            </span>
          </p>
          {t.descricao && !t.concluida && (
            <div className="mt-1">
              <Markdown content={t.descricao} />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar" onClick={() => onEdit(t)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Eliminar" onClick={() => onDelete(t)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </li>
  )
}

function PrioridadeSelector({ value, onChange }: { value: PrioridadeTarefa; onChange: (v: PrioridadeTarefa) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium shadow-xs hover:bg-accent">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${PRIORIDADE_COLOR[value]}`}>
          {PRIORIDADE_LABEL[value]}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(['ALTA', 'NORMAL', 'BAIXA'] as PrioridadeTarefa[]).map((p) => (
          <DropdownMenuItem key={p} onClick={() => onChange(p)}>
            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${PRIORIDADE_COLOR[p]}`}>
              {PRIORIDADE_LABEL[p]}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
