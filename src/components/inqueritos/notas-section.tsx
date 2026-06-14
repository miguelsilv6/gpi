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
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { StickyNote, Send, Trash2, Loader2, Pencil, X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'

export interface NotaItem {
  id: string
  titulo: string | null
  conteudo: string
  createdAt: string
  updatedAt: string
  autor: { id: string; nome: string }
  editadoPor: { id: string; nome: string } | null
}

interface Props {
  nuipcSlug: string
  notas: NotaItem[]
  canAdd: boolean
  currentUserId: string
  isAdmin: boolean
}

export function NotasSection({ nuipcSlug, notas, canAdd, currentUserId, isAdmin }: Props) {
  const router = useRouter()
  const [composing, setComposing] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<NotaItem | null>(null)
  const [editTitulo, setEditTitulo] = useState('')
  const [editConteudo, setEditConteudo] = useState('')
  const [toDelete, setToDelete] = useState<NotaItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  function resetCompose() {
    setComposing(false)
    setTitulo('')
    setConteudo('')
  }

  async function handleAdd() {
    const text = conteudo.trim()
    if (!text) return
    setSaving(true)
    try {
      const res = await fetch(`/api/inqueritos/${nuipcSlug}/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo: text, titulo: titulo.trim() || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao adicionar a nota')
        return
      }
      toast.success('Nota adicionada')
      resetCompose()
      router.refresh()
    } catch {
      toast.error('Erro de rede ao adicionar a nota')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(n: NotaItem) {
    setEditing(n)
    setEditTitulo(n.titulo ?? '')
    setEditConteudo(n.conteudo)
  }

  async function handleSaveEdit() {
    if (!editing) return
    const text = editConteudo.trim()
    if (!text) return
    setSaving(true)
    try {
      const res = await fetch(`/api/notas-inquerito/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo: text, titulo: editTitulo.trim() || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar a nota')
        return
      }
      toast.success('Nota atualizada')
      setEditing(null)
      router.refresh()
    } catch {
      toast.error('Erro de rede ao guardar a nota')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/notas-inquerito/${toDelete.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao eliminar a nota')
        return
      }
      toast.success('Nota eliminada')
      setToDelete(null)
      router.refresh()
    } catch {
      toast.error('Erro de rede ao eliminar a nota')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          Notas de investigação
          {notas.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({notas.length})</span>
          )}
        </CardTitle>
        <HelpButton title="Ajuda — Notas de investigação">
          <HelpSection title="O que são as notas">
            <p>As notas permitem registar informação específica deste inquérito — diligências realizadas, contactos, observações ou lembretes. Cada nota guarda o autor, a data e a última edição, formando um registo cronológico.</p>
          </HelpSection>
          <HelpSection title="Editor estilo Notion">
            <p>Use a barra de formatação ou escreva <strong>Markdown</strong> diretamente. Prima <strong>&quot;/&quot;</strong> no início de uma linha para abrir o menu de blocos (títulos, listas, tarefas, citações, código). Atalhos: <strong>Ctrl+B</strong> (negrito), <strong>Ctrl+I</strong> (itálico), <strong>Ctrl+Enter</strong> (guardar).</p>
          </HelpSection>
          <HelpSection title="Editar e eliminar">
            <p>Pode editar e eliminar as suas próprias notas (ou, se for administrador, qualquer nota). Todas as criações, edições e eliminações ficam registadas na auditoria.</p>
          </HelpSection>
          <HelpSection title="Página de Notas">
            <p>No menu lateral, a página <strong>Notas</strong> reúne todas as notas a que tem acesso, agrupadas por inquérito e pesquisáveis.</p>
          </HelpSection>
        </HelpButton>
      </CardHeader>
      <CardContent className="space-y-4">
        {canAdd && (
          composing ? (
            <div className="space-y-2 rounded-lg border bg-muted/10 p-3">
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={200}
                placeholder="Título (opcional)"
                className="font-medium"
              />
              <NotaEditor value={conteudo} onChange={setConteudo} onSubmit={handleAdd} autoFocus />
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={resetCompose} disabled={saving}>
                  Cancelar
                </Button>
                <Button size="sm" className="gap-1.5" disabled={saving || !conteudo.trim()} onClick={handleAdd}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Adicionar nota
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setComposing(true)}>
              <Plus className="h-3.5 w-3.5" /> Nova nota
            </Button>
          )
        )}

        {notas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Sem notas registadas.
            {canAdd && ' As notas adicionadas ficam guardadas com autor e data.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {notas.map((n) => {
              const canModify = isAdmin || n.autor.id === currentUserId
              const wasEdited = n.updatedAt !== n.createdAt
              return (
                <li key={n.id} className="rounded-lg border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {n.titulo && <p className="text-sm font-semibold break-words mb-1">{n.titulo}</p>}
                      <Markdown content={n.conteudo} />
                    </div>
                    {canModify && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          title="Editar nota"
                          onClick={() => startEdit(n)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          title="Eliminar nota"
                          onClick={() => setToDelete(n)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {n.autor.nome} · {formatDateTime(n.createdAt)}
                    {wasEdited && (
                      <span className="italic">
                        {' · editado'}
                        {n.editadoPor && n.editadoPor.id !== n.autor.id ? ` por ${n.editadoPor.nome}` : ''}{' '}
                        {formatDateTime(n.updatedAt)}
                      </span>
                    )}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      {/* Diálogo de edição */}
      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Editar nota
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={editTitulo}
              onChange={(e) => setEditTitulo(e.target.value)}
              maxLength={200}
              placeholder="Título (opcional)"
              className="font-medium"
            />
            <NotaEditor value={editConteudo} onChange={setEditConteudo} onSubmit={handleSaveEdit} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving} className="gap-1.5">
              <X className="h-4 w-4" /> Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editConteudo.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de eliminação */}
      <Dialog open={!!toDelete} onOpenChange={(v) => { if (!v) setToDelete(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar nota?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta ação elimina permanentemente a nota e não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>
              Cancelar
            </Button>
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
