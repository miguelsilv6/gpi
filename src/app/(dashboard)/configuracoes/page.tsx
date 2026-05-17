'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { ESTADO_COR_CLASSES, ESTADO_COR_DEFAULT } from '@/lib/constants'
import { Loader2, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EstadosTab } from './estados-tab'

// ─── System config ────────────────────────────────────────────────────────────

const schema = z.object({
  prazoAlertaDias: z.number().int().min(1).max(365),
  backupScheduleCron: z.string().min(1),
  emailRemetenteNome: z.string().min(1),
  emailRemetenteAddr: z.string().email('Email inválido'),
})
type FormData = z.infer<typeof schema>

interface EstadoOption {
  id: string
  codigo: string
  nome: string
  cor: string | null
  ativo: boolean
}

// ─── Atividade Padrão ─────────────────────────────────────────────────────────

interface AtividadePadrao {
  id: string
  nome: string
  descricao: string | null
  ativa: boolean
  ordem: number
  temPrazo: boolean
  temQuantidade: boolean
  contaParaEstatistica: boolean
  transicaoEstadoId: string | null
}

const TRANSICAO_NONE = '__none__'

function AtividadesTab({ estados }: { estados: EstadoOption[] }) {
  const [atividades, setAtividades] = useState<AtividadePadrao[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newDescricao, setNewDescricao] = useState('')
  const [newTemPrazo, setNewTemPrazo] = useState(false)
  const [newTemQuantidade, setNewTemQuantidade] = useState(false)
  const [newContaParaEstatistica, setNewContaParaEstatistica] = useState(true)
  const [newTransicaoEstadoId, setNewTransicaoEstadoId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editDescricao, setEditDescricao] = useState('')
  const [editTemPrazo, setEditTemPrazo] = useState(false)
  const [editTemQuantidade, setEditTemQuantidade] = useState(false)
  const [editContaParaEstatistica, setEditContaParaEstatistica] = useState(true)
  const [editTransicaoEstadoId, setEditTransicaoEstadoId] = useState<string>('')
  const [deleteCandidate, setDeleteCandidate] = useState<AtividadePadrao | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteInUseCount, setDeleteInUseCount] = useState<number | null>(null)

  const estadosAtivos = estados.filter((e) => e.ativo)
  const estadoById = new Map(estados.map((e) => [e.id, e]))

  async function load() {
    setLoading(true)
    const res = await fetch('/api/atividades-padrao')
    if (res.ok) setAtividades(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    if (!newNome.trim()) return
    setSaving(true)
    const res = await fetch('/api/atividades-padrao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: newNome.trim(),
        descricao: newDescricao.trim() || null,
        temPrazo: newTemPrazo,
        temQuantidade: newTemQuantidade,
        contaParaEstatistica: newContaParaEstatistica,
        transicaoEstadoId: newTransicaoEstadoId || null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao criar')
      return
    }
    toast.success('Atividade padrão criada')
    setNewNome('')
    setNewDescricao('')
    setNewTemPrazo(false)
    setNewTemQuantidade(false)
    setNewContaParaEstatistica(true)
    setNewTransicaoEstadoId('')
    setAdding(false)
    load()
  }

  async function handleToggleField(
    a: AtividadePadrao,
    field: 'ativa' | 'temPrazo' | 'temQuantidade' | 'contaParaEstatistica',
  ) {
    const res = await fetch(`/api/atividades-padrao/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !a[field] }),
    })
    if (res.ok) {
      setAtividades((prev) => prev.map((x) => x.id === a.id ? { ...x, [field]: !x[field] } : x))
    }
  }

  async function openDeleteDialog(a: AtividadePadrao) {
    setDeleteCandidate(a)
    setDeleteInUseCount(null)
    // Probe: try DELETE optimistically? No — better do a HEAD count via a
    // separate endpoint, but to avoid adding routes we just attempt a no-op
    // count via the existing list of atividades (snapshot match by nome would
    // require a new endpoint). Simpler: leave the count null and rely on the
    // server-side guard. The dialog shows both actions; if hard-delete fails,
    // we surface the error.
  }

  function closeDeleteDialog() {
    setDeleteCandidate(null)
    setDeleting(false)
    setDeleteInUseCount(null)
  }

  async function handleDeactivate() {
    if (!deleteCandidate) return
    setDeleting(true)
    const res = await fetch(`/api/atividades-padrao/${deleteCandidate.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativa: false }),
    })
    setDeleting(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao desativar')
      return
    }
    setAtividades((prev) =>
      prev.map((x) =>
        x.id === deleteCandidate.id ? { ...x, ativa: false } : x,
      ),
    )
    toast.success('Atividade desativada')
    closeDeleteDialog()
  }

  async function handleHardDelete() {
    if (!deleteCandidate) return
    setDeleting(true)
    const res = await fetch(`/api/atividades-padrao/${deleteCandidate.id}`, {
      method: 'DELETE',
    })
    setDeleting(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      // Extract a count if the server reports one ("Atividade padrão em uso em N atividade(s)...")
      const match = /em uso em (\d+)/.exec(err?.error ?? '')
      if (match) setDeleteInUseCount(parseInt(match[1]!, 10))
      toast.error(err.error ?? 'Erro ao eliminar')
      return
    }
    setAtividades((prev) => prev.filter((x) => x.id !== deleteCandidate.id))
    toast.success('Atividade eliminada')
    closeDeleteDialog()
  }

  async function handleEdit(a: AtividadePadrao) {
    setEditId(a.id)
    setEditNome(a.nome)
    setEditDescricao(a.descricao ?? '')
    setEditTemPrazo(a.temPrazo)
    setEditTemQuantidade(a.temQuantidade)
    setEditContaParaEstatistica(a.contaParaEstatistica)
    setEditTransicaoEstadoId(a.transicaoEstadoId ?? '')
  }

  async function handleEditSave(id: string) {
    if (!editNome.trim()) return
    const res = await fetch(`/api/atividades-padrao/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: editNome.trim(),
        descricao: editDescricao.trim() || null,
        temPrazo: editTemPrazo,
        temQuantidade: editTemQuantidade,
        contaParaEstatistica: editContaParaEstatistica,
        transicaoEstadoId: editTransicaoEstadoId || null,
      }),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao guardar')
      return
    }
    const updated = await res.json()
    setAtividades((prev) => prev.map((x) => x.id === id ? updated : x))
    setEditId(null)
    toast.success('Guardado')
  }

  if (loading) return <div className="text-sm text-muted-foreground py-4">A carregar...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Defina as atividades padrão. Os badges <span className="font-medium">Prazo</span> e <span className="font-medium">Qtd</span> ativam campos extra no registo.
          </p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nova atividade
          </Button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="newNome">Nome *</Label>
              <Input
                id="newNome"
                autoFocus
                placeholder="Ex: Recolha de depoimentos"
                value={newNome}
                onChange={(e) => setNewNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newDescricao">Descrição</Label>
              <Input
                id="newDescricao"
                placeholder="Descrição opcional"
                value={newDescricao}
                onChange={(e) => setNewDescricao(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newTemPrazo}
                  onChange={(e) => setNewTemPrazo(e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                <span>Tem prazo</span>
                <span className="text-xs text-muted-foreground">(mostra data limite e alertas)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newTemQuantidade}
                  onChange={(e) => setNewTemQuantidade(e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                <span>Tem quantidade</span>
                <span className="text-xs text-muted-foreground">(mostra campo numérico)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newContaParaEstatistica}
                  onChange={(e) => setNewContaParaEstatistica(e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                <span>Conta para estatística</span>
                <span className="text-xs text-muted-foreground">(aparece nos resumos por tipo)</span>
              </label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newTransicao">Altera estado do inquérito para</Label>
              <Select
                value={newTransicaoEstadoId || TRANSICAO_NONE}
                onValueChange={(v) =>
                  setNewTransicaoEstadoId(!v || v === TRANSICAO_NONE ? '' : v)
                }
              >
                <SelectTrigger id="newTransicao">
                  <SelectValue>
                    {(v: string) => {
                      if (!v || v === TRANSICAO_NONE) return 'Não altera o estado'
                      return estadoById.get(v)?.nome ?? 'Não altera o estado'
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TRANSICAO_NONE}>Não altera o estado</SelectItem>
                  {estadosAtivos.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Quando esta atividade for adicionada a um inquérito, o estado passará automaticamente
                para o escolhido (respeitando a máquina de estados).
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleAdd} disabled={saving || !newNome.trim()}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Adicionar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                setAdding(false); setNewNome(''); setNewDescricao('')
                setNewTemPrazo(false); setNewTemQuantidade(false)
              }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {atividades.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhuma atividade padrão criada.
        </p>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-card">
          {atividades.map((a, i) => (
            <div
              key={a.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 transition-colors',
                i > 0 && 'border-t',
                !a.ativa && 'opacity-50',
              )}
            >
              {editId === a.id ? (
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      autoFocus
                      className="h-8 text-sm flex-1 min-w-[160px]"
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleEditSave(a.id)}
                    />
                    <Input
                      className="h-8 text-sm flex-1 min-w-[160px]"
                      placeholder="Descrição"
                      value={editDescricao}
                      onChange={(e) => setEditDescricao(e.target.value)}
                    />
                    <div className="flex gap-1">
                      <button onClick={() => handleEditSave(a.id)} className="p-1.5 rounded hover:bg-muted text-green-600"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setEditId(null)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editTemPrazo}
                        onChange={(e) => setEditTemPrazo(e.target.checked)}
                        className="h-4 w-4 rounded border"
                      />
                      <span>Tem prazo</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editTemQuantidade}
                        onChange={(e) => setEditTemQuantidade(e.target.checked)}
                        className="h-4 w-4 rounded border"
                      />
                      <span>Tem quantidade</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editContaParaEstatistica}
                        onChange={(e) => setEditContaParaEstatistica(e.target.checked)}
                        className="h-4 w-4 rounded border"
                      />
                      <span>Conta para estatística</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs text-muted-foreground">Altera estado para</Label>
                    <Select
                      value={editTransicaoEstadoId || TRANSICAO_NONE}
                      onValueChange={(v) =>
                        setEditTransicaoEstadoId(!v || v === TRANSICAO_NONE ? '' : v)
                      }
                    >
                      <SelectTrigger className="h-8 w-[200px] text-xs">
                        <SelectValue>
                          {(v: string) => {
                            if (!v || v === TRANSICAO_NONE) return 'Não altera o estado'
                            return estadoById.get(v)?.nome ?? 'Não altera o estado'
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TRANSICAO_NONE}>Não altera o estado</SelectItem>
                        {estadosAtivos.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{a.nome}</p>
                    {a.descricao && <p className="text-xs text-muted-foreground">{a.descricao}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                    {/* Transição badge */}
                    {a.transicaoEstadoId && (() => {
                      const target = estadoById.get(a.transicaoEstadoId)
                      if (!target) return null
                      const corClass = target.cor
                        ? ESTADO_COR_CLASSES[target.cor] ?? ESTADO_COR_DEFAULT
                        : ESTADO_COR_DEFAULT
                      return (
                        <span
                          title={`Altera o estado do inquérito para «${target.nome}»`}
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium border',
                            corClass,
                          )}
                        >
                          → {target.nome}
                        </span>
                      )
                    })()}
                    {/* Prazo toggle */}
                    <button
                      onClick={() => handleToggleField(a, 'temPrazo')}
                      title="Clique para ativar/desativar prazo"
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                        a.temPrazo
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                          : 'bg-muted text-muted-foreground/60',
                      )}
                    >
                      Prazo
                    </button>
                    {/* Quantidade toggle */}
                    <button
                      onClick={() => handleToggleField(a, 'temQuantidade')}
                      title="Clique para ativar/desativar quantidade"
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                        a.temQuantidade
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                          : 'bg-muted text-muted-foreground/60',
                      )}
                    >
                      Qtd
                    </button>
                    {/* Estatística toggle */}
                    <button
                      onClick={() => handleToggleField(a, 'contaParaEstatistica')}
                      title="Conta para resumos por tipo e estatísticas"
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                        a.contaParaEstatistica
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-muted text-muted-foreground/60',
                      )}
                    >
                      Estatística
                    </button>
                    {/* Ativa toggle */}
                    <button
                      onClick={() => handleToggleField(a, 'ativa')}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                        a.ativa
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {a.ativa ? 'Ativa' : 'Inativa'}
                    </button>
                    <button onClick={() => handleEdit(a)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => openDeleteDialog(a)}
                      title="Apagar ou desativar"
                      className="p-1.5 rounded hover:bg-muted text-red-500 hover:text-red-700"
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
        onOpenChange={(open) => !open && closeDeleteDialog()}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apagar atividade padrão</DialogTitle>
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
                  A atividade não aparece na lista para novos registos. O histórico
                  fica intacto. Pode reativar a qualquer altura.
                </p>
                <Button
                  size="sm"
                  onClick={handleDeactivate}
                  disabled={deleting || !deleteCandidate.ativa}
                  className="w-full"
                >
                  {deleting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {deleteCandidate.ativa ? 'Desativar' : 'Já está desativada'}
                </Button>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-3 space-y-2">
                <p className="font-medium text-red-900 dark:text-red-200">
                  Eliminar permanentemente
                </p>
                <p className="text-xs text-red-900/80 dark:text-red-200/80">
                  Apaga o registo do catálogo. Não é possível se já existirem
                  atividades deste tipo em inquéritos — nesse caso desative em vez.
                </p>
                {deleteInUseCount !== null && deleteInUseCount > 0 && (
                  <p className="text-xs font-medium text-red-900 dark:text-red-200">
                    Em uso em {deleteInUseCount} atividade(s) — não pode ser eliminada.
                  </p>
                )}
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
            <Button variant="ghost" size="sm" onClick={closeDeleteDialog}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'sistema' | 'estados' | 'atividades'

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('sistema')
  const [estados, setEstados] = useState<EstadoOption[]>([])
  const [estadosDefault, setEstadosDefault] = useState<string[]>([])
  const [savingDefault, setSavingDefault] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    Promise.all([
      fetch('/api/configuracoes').then((r) => r.json()),
      fetch('/api/estados-inquerito').then((r) => r.json()),
    ])
      .then(([d, e]) => {
        reset({
          prazoAlertaDias: d.prazoAlertaDias,
          backupScheduleCron: d.backupScheduleCron,
          emailRemetenteNome: d.emailRemetenteNome,
          emailRemetenteAddr: d.emailRemetenteAddr,
        })
        setEstadosDefault(d.inqueritoFiltroEstadosDefault ?? [])
        setEstados(Array.isArray(e) ? e : [])
        setLoading(false)
      })
      .catch(() => {
        toast.error('Erro ao carregar configurações')
        setLoading(false)
      })
  }, [reset])

  // Refresh the estados list when the user enters Sistema (so the predefinição
  // chips reflect any state added/removed in the Estados tab) — and also when
  // entering Estados (so the list there stays fresh after creating/editing).
  useEffect(() => {
    if (loading) return
    if (tab !== 'sistema' && tab !== 'estados') return
    fetch('/api/estados-inquerito')
      .then((r) => r.json())
      .then((e) => {
        if (Array.isArray(e)) setEstados(e)
      })
      .catch(() => {})
  }, [tab, loading])

  async function onSubmit(data: FormData) {
    const res = await fetch('/api/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao guardar')
      return
    }
    toast.success('Configurações guardadas')
  }

  async function saveEstadosDefault(next: string[]) {
    setSavingDefault(true)
    setEstadosDefault(next)
    const res = await fetch('/api/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inqueritoFiltroEstadosDefault: next }),
    })
    setSavingDefault(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao guardar predefinição')
      return
    }
    toast.success('Predefinição actualizada')
  }

  function toggleEstadoDefault(codigo: string) {
    const next = estadosDefault.includes(codigo)
      ? estadosDefault.filter((c) => c !== codigo)
      : [...estadosDefault, codigo]
    saveEstadosDefault(next)
  }

  if (loading) return <div className="text-sm text-muted-foreground">A carregar...</div>

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground text-sm">Configurações do sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-0">
        {(['sistema', 'estados', 'atividades'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
              tab === t
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t === 'sistema' ? 'Sistema' : t === 'estados' ? 'Estados' : 'Atividades'}
          </button>
        ))}
      </div>

      {/* Sistema tab */}
      {tab === 'sistema' && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prazos e Alertas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="prazoAlertaDias">Alertar prazo com antecedência (dias)</Label>
                <Input
                  id="prazoAlertaDias"
                  type="number"
                  min={1}
                  max={365}
                  {...register('prazoAlertaDias')}
                />
                {errors.prazoAlertaDias && (
                  <p className="text-xs text-red-600">{errors.prazoAlertaDias.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Backups</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="backupScheduleCron">Agendamento (cron expression)</Label>
                <Input
                  id="backupScheduleCron"
                  {...register('backupScheduleCron')}
                  placeholder="0 2 * * *"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Ex: <code>0 2 * * *</code> = todos os dias às 02:00
                </p>
                {errors.backupScheduleCron && (
                  <p className="text-xs text-red-600">{errors.backupScheduleCron.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email do sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="emailRemetenteNome">Nome do remetente</Label>
                <Input id="emailRemetenteNome" {...register('emailRemetenteNome')} />
                {errors.emailRemetenteNome && (
                  <p className="text-xs text-red-600">{errors.emailRemetenteNome.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emailRemetenteAddr">Endereço de remetente</Label>
                <Input id="emailRemetenteAddr" type="email" {...register('emailRemetenteAddr')} />
                {errors.emailRemetenteAddr && (
                  <p className="text-xs text-red-600">{errors.emailRemetenteAddr.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtro predefinido na lista de inquéritos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Quando um utilizador abre <code>/inqueritos</code> sem filtros activos, são aplicados
                automaticamente os estados aqui escolhidos. Em qualquer altura o utilizador pode
                limpar ou trocar a selecção.
              </p>
              {estados.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Sem estados configurados.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {estados
                    .filter((e) => e.ativo)
                    .map((e) => {
                      const active = estadosDefault.includes(e.codigo)
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => toggleEstadoDefault(e.codigo)}
                          disabled={savingDefault}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
                            active
                              ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                              : 'bg-card text-muted-foreground border-input hover:bg-muted',
                          )}
                        >
                          {active && <Check className="h-3 w-3" />}
                          {e.nome}
                        </button>
                      )
                    })}
                </div>
              )}
              {estadosDefault.length === 0 && estados.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum estado predefinido — a lista abre sem filtro de estado.
                </p>
              )}
            </CardContent>
          </Card>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar configurações
          </Button>
        </form>
      )}

      {/* Estados tab */}
      {tab === 'estados' && <EstadosTab />}

      {/* Atividades tab */}
      {tab === 'atividades' && <AtividadesTab estados={estados} />}
    </div>
  )
}
