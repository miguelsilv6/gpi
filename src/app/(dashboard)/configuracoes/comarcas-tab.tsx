'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { cn, iconButtonClasses } from '@/lib/utils'

interface Comarca {
  id: string
  nome: string
  ordem: number
  ativo: boolean
  _count: { tribunais: number }
}

const EMPTY: { nome: string; ordem: number; ativo: boolean } = {
  nome: '',
  ordem: 0,
  ativo: true,
}

export function ComarcasTab() {
  const [comarcas, setComarcas] = useState<Comarca[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [neu, setNeu] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editOrdem, setEditOrdem] = useState(0)
  const [deleteCandidate, setDeleteCandidate] = useState<Comarca | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/comarcas')
    if (res.ok) setComarcas(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    if (!neu.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    const res = await fetch('/api/comarcas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: neu.nome.trim(), ordem: neu.ordem, ativo: neu.ativo }),
    })
    setSaving(false)
    if (!res.ok) { const e = await res.json(); toast.error(e.error ?? 'Erro ao criar'); return }
    toast.success('Comarca criada')
    setNeu(EMPTY)
    setAdding(false)
    load()
  }

  async function handleEditSave(c: Comarca) {
    if (!editNome.trim()) return
    const res = await fetch(`/api/comarcas/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: editNome.trim(), ordem: editOrdem }),
    })
    if (!res.ok) { const e = await res.json(); toast.error(e.error ?? 'Erro ao guardar'); return }
    const updated = await res.json()
    setComarcas((prev) => prev.map((x) => x.id === c.id ? updated : x))
    setEditId(null)
    toast.success('Guardado')
  }

  async function handleToggleAtivo(c: Comarca) {
    const res = await fetch(`/api/comarcas/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !c.ativo }),
    })
    if (res.ok) {
      const updated = await res.json()
      setComarcas((prev) => prev.map((x) => x.id === c.id ? updated : x))
    }
  }

  async function handleDelete() {
    if (!deleteCandidate) return
    setDeleting(true)
    const res = await fetch(`/api/comarcas/${deleteCandidate.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error ?? 'Erro ao eliminar'); return }
    setComarcas((prev) => prev.filter((x) => x.id !== deleteCandidate.id))
    setDeleteCandidate(null)
    toast.success('Comarca eliminada')
  }

  if (loading) return <div className="text-sm text-muted-foreground py-4">A carregar...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Comarcas judiciais do território nacional. Os tribunais são organizados por comarca.
        </p>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nova comarca
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-xl border border-dashed p-4 space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <Label htmlFor="newNome">Nome *</Label>
              <Input
                id="newNome"
                autoFocus
                placeholder="Ex: Comarca de Lisboa"
                value={neu.nome}
                onChange={(e) => setNeu((p) => ({ ...p, nome: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div className="w-24 space-y-1.5">
              <Label htmlFor="newOrdem">Ordem</Label>
              <Input
                id="newOrdem"
                type="number"
                min={0}
                value={neu.ordem}
                onChange={(e) => setNeu((p) => ({ ...p, ordem: parseInt(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving || !neu.nome.trim()}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Adicionar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNeu(EMPTY) }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {comarcas.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma comarca criada.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-card">
          {comarcas.map((c, i) => (
            <div
              key={c.id}
              className={cn('flex items-center gap-3 px-4 py-3 transition-colors', i > 0 && 'border-t', !c.ativo && 'opacity-50')}
            >
              {editId === c.id ? (
                <div className="flex-1 flex items-center gap-2 flex-wrap">
                  <Input
                    autoFocus
                    className="h-8 text-sm flex-1 min-w-[180px]"
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEditSave(c)}
                  />
                  <Input
                    type="number"
                    className="h-8 text-sm w-20"
                    value={editOrdem}
                    onChange={(e) => setEditOrdem(parseInt(e.target.value) || 0)}
                  />
                  <div className="flex gap-1">
                    <button onClick={() => handleEditSave(c)} className={cn(iconButtonClasses, 'text-green-600')} aria-label="Guardar"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setEditId(null)} className={cn(iconButtonClasses, 'text-muted-foreground')} aria-label="Cancelar"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">{c._count.tribunais} tribunal(ais)</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleAtivo(c)}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                        c.ativo
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {c.ativo ? 'Ativa' : 'Inativa'}
                    </button>
                    <button
                      onClick={() => { setEditId(c.id); setEditNome(c.nome); setEditOrdem(c.ordem) }}
                      className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                      aria-label={`Editar ${c.nome}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteCandidate(c)}
                      className={cn(iconButtonClasses, 'text-red-500 hover:text-red-700')}
                      aria-label={`Eliminar ${c.nome}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!deleteCandidate} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar comarca</DialogTitle>
          </DialogHeader>
          {deleteCandidate && (
            <p className="text-sm">
              Eliminar <strong>«{deleteCandidate.nome}»</strong>?
              {deleteCandidate._count.tribunais > 0 && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  Tem {deleteCandidate._count.tribunais} tribunal(ais) associados — mova-os primeiro.
                </span>
              )}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteCandidate(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting || (deleteCandidate?._count.tribunais ?? 0) > 0}
            >
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
