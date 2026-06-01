'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { cn, iconButtonClasses } from '@/lib/utils'

interface Seccao {
  id: string
  nome: string
  descricao: string | null
  ordem: number
  ativo: boolean
}

const EMPTY_NEW = {
  nome: '',
  descricao: '',
  ordem: 0,
  ativo: true,
}

export function SeccoesTab() {
  const [seccoes, setSeccoes] = useState<Seccao[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [neu, setNeu] = useState(EMPTY_NEW)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ nome: '', descricao: '', ordem: 0 })
  const [deleteCandidate, setDeleteCandidate] = useState<Seccao | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/seccoes')
    if (res.ok) setSeccoes(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    if (!neu.nome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    setSaving(true)
    const res = await fetch('/api/seccoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: neu.nome.trim(),
        descricao: neu.descricao.trim() || null,
        ordem: neu.ordem,
        ativo: neu.ativo,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao criar secção')
      return
    }
    toast.success('Secção criada')
    setNeu(EMPTY_NEW)
    setAdding(false)
    load()
  }

  async function handleToggleAtivo(c: Seccao) {
    const res = await fetch(`/api/seccoes/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !c.ativo }),
    })
    if (res.ok) {
      setSeccoes((prev) => prev.map((x) => (x.id === c.id ? { ...x, ativo: !x.ativo } : x)))
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao alterar')
    }
  }

  function startEdit(c: Seccao) {
    setEditId(c.id)
    setEdit({ nome: c.nome, descricao: c.descricao ?? '', ordem: c.ordem })
  }

  async function handleEditSave(id: string) {
    if (!edit.nome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    const res = await fetch(`/api/seccoes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: edit.nome.trim(),
        descricao: edit.descricao.trim() || null,
        ordem: edit.ordem,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao guardar')
      return
    }
    const updated = await res.json()
    setSeccoes((prev) => prev.map((x) => (x.id === id ? updated : x)))
    setEditId(null)
    toast.success('Guardado')
  }

  async function handleDeactivate() {
    if (!deleteCandidate) return
    setDeleting(true)
    const res = await fetch(`/api/seccoes/${deleteCandidate.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: false }),
    })
    setDeleting(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao desativar')
      return
    }
    setSeccoes((prev) =>
      prev.map((x) => (x.id === deleteCandidate.id ? { ...x, ativo: false } : x)),
    )
    toast.success('Secção desativada')
    setDeleteCandidate(null)
  }

  async function handleHardDelete() {
    if (!deleteCandidate) return
    setDeleting(true)
    const res = await fetch(`/api/seccoes/${deleteCandidate.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao eliminar')
      return
    }
    setSeccoes((prev) => prev.filter((x) => x.id !== deleteCandidate.id))
    toast.success('Secção eliminada')
    setDeleteCandidate(null)
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">A carregar...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Catálogo de secções de tribunal. Apenas secções ativas aparecem na seleção de inquéritos.
        </p>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nova secção
          </Button>
        )}
      </div>

      {adding && (
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="newNome">Nome *</Label>
              <Input
                id="newNome"
                autoFocus
                placeholder="Ex: 1ª Secção"
                value={neu.nome}
                onChange={(e) => setNeu({ ...neu, nome: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newDescricao">Descrição</Label>
              <Textarea
                id="newDescricao"
                placeholder="Descrição opcional"
                rows={2}
                value={neu.descricao}
                onChange={(e) => setNeu({ ...neu, descricao: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 max-w-[160px]">
              <Label htmlFor="newOrdem">Ordem</Label>
              <Input
                id="newOrdem"
                type="number"
                min={0}
                value={neu.ordem}
                onChange={(e) => setNeu({ ...neu, ordem: parseInt(e.target.value || '0', 10) })}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleAdd} disabled={saving || !neu.nome.trim()}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Adicionar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false)
                  setNeu(EMPTY_NEW)
                }}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {seccoes.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhuma secção configurada. Adicione uma para começar.
        </p>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-card">
          {seccoes.map((c, i) => (
            <div
              key={c.id}
              className={cn(
                'flex items-start gap-3 px-4 py-3 transition-colors',
                i > 0 && 'border-t',
                !c.ativo && 'opacity-50',
              )}
            >
              {editId === c.id ? (
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      autoFocus
                      className="h-8 text-sm flex-1 min-w-[180px]"
                      value={edit.nome}
                      onChange={(e) => setEdit({ ...edit, nome: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && handleEditSave(c.id)}
                    />
                    <Input
                      className="h-8 text-sm w-[90px]"
                      type="number"
                      min={0}
                      value={edit.ordem}
                      onChange={(e) =>
                        setEdit({ ...edit, ordem: parseInt(e.target.value || '0', 10) })
                      }
                      title="Ordem"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEditSave(c.id)}
                        className={cn(iconButtonClasses, 'text-green-600')}
                        aria-label="Guardar"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className={cn(iconButtonClasses, 'text-muted-foreground')}
                        aria-label="Cancelar edição"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <Textarea
                    className="text-sm"
                    placeholder="Descrição"
                    rows={2}
                    value={edit.descricao}
                    onChange={(e) => setEdit({ ...edit, descricao: e.target.value })}
                  />
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{c.nome}</p>
                    {c.descricao && (
                      <p className="text-xs text-muted-foreground mt-0.5">{c.descricao}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                    <button
                      onClick={() => handleToggleAtivo(c)}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                        c.ativo
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                    <button
                      onClick={() => startEdit(c)}
                      className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                      aria-label={`Editar ${c.nome}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteCandidate(c)}
                      title="Apagar ou desativar"
                      aria-label={`Apagar ${c.nome}`}
                      className={cn(iconButtonClasses, 'text-red-500 hover:text-red-700')}
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

      <Dialog
        open={!!deleteCandidate}
        onOpenChange={(open) => !open && setDeleteCandidate(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apagar secção</DialogTitle>
          </DialogHeader>
          {deleteCandidate && (
            <div className="space-y-3 text-sm">
              <p>
                «<strong>{deleteCandidate.nome}</strong>»
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3 space-y-2">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  Desativar (recomendado)
                </p>
                <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                  A secção deixa de aparecer na criação de novos inquéritos, mas os inquéritos
                  existentes mantêm a referência intacta.
                </p>
                <Button
                  size="sm"
                  onClick={handleDeactivate}
                  disabled={deleting || !deleteCandidate.ativo}
                  className="w-full"
                >
                  {deleting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {deleteCandidate.ativo ? 'Desativar' : 'Já está desativada'}
                </Button>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-3 space-y-2">
                <p className="font-medium text-red-900 dark:text-red-200">
                  Eliminar permanentemente
                </p>
                <p className="text-xs text-red-900/80 dark:text-red-200/80">
                  Apaga o registo do catálogo. Não é possível se já existirem inquéritos
                  associados a esta secção — nesse caso desative em vez de eliminar.
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleHardDelete}
                  disabled={deleting}
                  className="w-full"
                >
                  {deleting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Eliminar
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteCandidate(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
