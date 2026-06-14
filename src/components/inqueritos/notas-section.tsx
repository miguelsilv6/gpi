'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { StickyNote, Send, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'

const MAX_LEN = 5000

export interface NotaItem {
  id: string
  conteudo: string
  createdAt: string
  autor: { id: string; nome: string }
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
  const [conteudo, setConteudo] = useState('')
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState<NotaItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleAdd() {
    const text = conteudo.trim()
    if (!text) return
    setSaving(true)
    try {
      const res = await fetch(`/api/inqueritos/${nuipcSlug}/notas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo: text }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao adicionar a nota')
        return
      }
      toast.success('Nota adicionada')
      setConteudo('')
      router.refresh()
    } catch {
      toast.error('Erro de rede ao adicionar a nota')
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
            <p>As notas permitem registar informação específica deste inquérito — diligências realizadas, contactos, observações ou lembretes. Cada nota fica guardada com o autor e a data, formando um registo cronológico.</p>
          </HelpSection>
          <HelpSection title="Adicionar uma nota">
            <p>Escreva no campo de texto e clique em <strong>Adicionar nota</strong> (ou prima <strong>Ctrl+Enter</strong>). As notas são apresentadas da mais recente para a mais antiga.</p>
          </HelpSection>
          <HelpSection title="Registo e eliminação">
            <p>As notas não podem ser editadas, para preservar a integridade do registo. Pode eliminar as suas próprias notas (ou, se for administrador, qualquer nota). Cada criação e eliminação fica registada na auditoria.</p>
          </HelpSection>
        </HelpButton>
      </CardHeader>
      <CardContent className="space-y-4">
        {canAdd && (
          <div className="space-y-2">
            <Textarea
              rows={3}
              value={conteudo}
              maxLength={MAX_LEN}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder="Adicione uma nota específica deste inquérito (diligências, contactos, observações)…"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  void handleAdd()
                }
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {conteudo.length}/{MAX_LEN} · Ctrl+Enter para guardar
              </span>
              <Button size="sm" className="gap-1.5" disabled={saving || !conteudo.trim()} onClick={handleAdd}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Adicionar nota
              </Button>
            </div>
          </div>
        )}

        {notas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Sem notas registadas.
            {canAdd && ' As notas adicionadas ficam guardadas com autor e data.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {notas.map((n) => {
              const canDelete = isAdmin || n.autor.id === currentUserId
              return (
                <li key={n.id} className="rounded-lg border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm whitespace-pre-wrap break-words min-w-0 flex-1">{n.conteudo}</p>
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive"
                        title="Eliminar nota"
                        onClick={() => setToDelete(n)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {n.autor.nome} · {formatDateTime(n.createdAt)}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

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
