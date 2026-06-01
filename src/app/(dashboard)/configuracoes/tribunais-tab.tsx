'use client'

import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Plus, Pencil, Trash2, Search, MapPin, Phone, Mail } from 'lucide-react'
import { cn, iconButtonClasses } from '@/lib/utils'

interface Comarca {
  id: string
  nome: string
  ativo: boolean
}

interface Tribunal {
  id: string
  nome: string
  comarcaId: string | null
  comarca: { id: string; nome: string } | null
  morada: string | null
  telefone: string | null
  email: string | null
  descricao: string | null
  ordem: number
  ativo: boolean
}

const COMARCA_NONE = '__none__'
const EMPTY_FORM = {
  nome: '',
  comarcaId: '',
  morada: '',
  telefone: '',
  email: '',
  descricao: '',
  ordem: 0,
  ativo: true,
}

type FormState = typeof EMPTY_FORM

export function TribunaisTab() {
  const [tribunais, setTribunais] = useState<Tribunal[]>([])
  const [comarcas, setComarcas] = useState<Comarca[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterComarcaId, setFilterComarcaId] = useState<string>('')

  // Dialog state (shared for create + edit)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editTarget, setEditTarget] = useState<Tribunal | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteCandidate, setDeleteCandidate] = useState<Tribunal | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    const [tRes, cRes] = await Promise.all([
      fetch('/api/tribunais'),
      fetch('/api/comarcas'),
    ])
    if (tRes.ok) setTribunais(await tRes.json())
    if (cRes.ok) setComarcas(await cRes.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setForm(EMPTY_FORM)
    setDialogMode('create')
    setEditTarget(null)
    setDialogOpen(true)
  }

  function openEdit(t: Tribunal) {
    setForm({
      nome: t.nome,
      comarcaId: t.comarcaId ?? '',
      morada: t.morada ?? '',
      telefone: t.telefone ?? '',
      email: t.email ?? '',
      descricao: t.descricao ?? '',
      ordem: t.ordem,
      ativo: t.ativo,
    })
    setDialogMode('edit')
    setEditTarget(t)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    const body = {
      nome: form.nome.trim(),
      comarcaId: form.comarcaId || null,
      morada: form.morada.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      descricao: form.descricao.trim() || null,
      ordem: form.ordem,
      ativo: form.ativo,
    }
    const url = dialogMode === 'edit' && editTarget ? `/api/tribunais/${editTarget.id}` : '/api/tribunais'
    const method = dialogMode === 'edit' ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) { const e = await res.json(); toast.error(e.error ?? 'Erro ao guardar'); return }
    const saved: Tribunal = await res.json()
    if (dialogMode === 'edit') {
      setTribunais((prev) => prev.map((x) => x.id === saved.id ? saved : x))
      toast.success('Tribunal atualizado')
    } else {
      setTribunais((prev) => [...prev, saved])
      toast.success('Tribunal criado')
    }
    setDialogOpen(false)
  }

  async function handleToggleAtivo(t: Tribunal) {
    const res = await fetch(`/api/tribunais/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !t.ativo }),
    })
    if (res.ok) {
      const updated = await res.json()
      setTribunais((prev) => prev.map((x) => x.id === t.id ? updated : x))
    }
  }

  async function handleDelete() {
    if (!deleteCandidate) return
    setDeleting(true)
    const res = await fetch(`/api/tribunais/${deleteCandidate.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast.error(e.error ?? 'Erro ao eliminar'); return }
    setTribunais((prev) => prev.filter((x) => x.id !== deleteCandidate.id))
    setDeleteCandidate(null)
    toast.success('Tribunal eliminado')
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return tribunais.filter((t) => {
      if (filterComarcaId && t.comarcaId !== filterComarcaId) return false
      if (!q) return true
      return (
        t.nome.toLowerCase().includes(q) ||
        (t.comarca?.nome ?? '').toLowerCase().includes(q) ||
        (t.morada ?? '').toLowerCase().includes(q)
      )
    })
  }, [tribunais, search, filterComarcaId])

  // Include inactive comarca if currently assigned to the tribunal being edited,
  // so it stays visible in the dropdown instead of showing an empty/broken state.
  const comarcasAtivas = useMemo(
    () => comarcas.filter((c) => c.ativo || c.id === form.comarcaId),
    [comarcas, form.comarcaId],
  )

  if (loading) return <div className="text-sm text-muted-foreground py-4">A carregar...</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {tribunais.length} tribunal(ais) registados em {comarcas.length} comarca(s).
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Novo tribunal
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Pesquisar tribunal ou morada..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={filterComarcaId || COMARCA_NONE} onValueChange={(v) => setFilterComarcaId(!v || v === COMARCA_NONE ? '' : v)}>
          <SelectTrigger className="h-9 w-[220px]">
            <SelectValue>
              {(v: string) => !v || v === COMARCA_NONE
                ? 'Todas as comarcas'
                : comarcas.find((c) => c.id === v)?.nome ?? 'Comarca'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={COMARCA_NONE}>Todas as comarcas</SelectItem>
            {comarcasAtivas.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {tribunais.length === 0 ? 'Nenhum tribunal registado.' : 'Nenhum resultado para os filtros aplicados.'}
        </p>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-card divide-y">
          {filtered.map((t) => (
            <div key={t.id} className={cn('px-4 py-3 transition-colors', !t.ativo && 'opacity-50')}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">{t.nome}</p>
                  {t.comarca && (
                    <p className="text-xs text-muted-foreground mt-0.5">{t.comarca.nome}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    {t.morada && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {t.morada}
                      </span>
                    )}
                    {t.telefone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        {t.telefone}
                      </span>
                    )}
                    {t.email && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        {t.email}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  <button
                    onClick={() => handleToggleAtivo(t)}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                      t.ativo
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {t.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                  <button onClick={() => openEdit(t)} className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')} aria-label={`Editar ${t.nome}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setDeleteCandidate(t)} className={cn(iconButtonClasses, 'text-red-500 hover:text-red-700')} aria-label={`Eliminar ${t.nome}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? 'Novo tribunal' : 'Editar tribunal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="tNome">Nome *</Label>
              <Input
                id="tNome"
                autoFocus={dialogMode === 'create'}
                placeholder="Ex: Tribunal Judicial da Comarca de Lisboa"
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tComarca">Comarca</Label>
              <Select
                value={form.comarcaId || COMARCA_NONE}
                onValueChange={(v) => setForm((p) => ({ ...p, comarcaId: !v || v === COMARCA_NONE ? '' : v }))}
              >
                <SelectTrigger id="tComarca">
                  <SelectValue>
                    {(v: string) => !v || v === COMARCA_NONE
                      ? 'Sem comarca'
                      : comarcas.find((c) => c.id === v)?.nome ?? 'Comarca'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={COMARCA_NONE}>Sem comarca</SelectItem>
                  {comarcasAtivas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tMorada">Morada</Label>
              <Textarea
                id="tMorada"
                placeholder="Ex: Rua Marquês de Fronteira, 1269-050 Lisboa"
                rows={2}
                value={form.morada}
                onChange={(e) => setForm((p) => ({ ...p, morada: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tTelefone">Telefone</Label>
                <Input
                  id="tTelefone"
                  placeholder="Ex: 213 222 050"
                  value={form.telefone}
                  onChange={(e) => setForm((p) => ({ ...p, telefone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tEmail">Email</Label>
                <Input
                  id="tEmail"
                  type="email"
                  placeholder="Ex: tj.lisboa@tribunais.pt"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tDescricao">Notas</Label>
              <Textarea
                id="tDescricao"
                placeholder="Notas adicionais (opcional)"
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="w-24 space-y-1.5">
                <Label htmlFor="tOrdem">Ordem</Label>
                <Input
                  id="tOrdem"
                  type="number"
                  min={0}
                  value={form.ordem}
                  onChange={(e) => setForm((p) => ({ ...p, ordem: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none mt-5">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))}
                  className="h-4 w-4 rounded border"
                />
                Ativo
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.nome.trim()}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {dialogMode === 'create' ? 'Criar' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteCandidate} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar tribunal</DialogTitle>
          </DialogHeader>
          {deleteCandidate && (
            <p className="text-sm">
              Eliminar <strong>«{deleteCandidate.nome}»</strong>? Esta operação não é possível se o
              tribunal estiver associado a inquéritos — desative-o em vez disso.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteCandidate(null)}>Cancelar</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
