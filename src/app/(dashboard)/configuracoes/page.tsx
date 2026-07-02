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
import { Loader2, Plus, Pencil, Trash2, Check, X, Banknote, CalendarDays, CalendarCheck, Mail, Bug, Wrench, Sparkles, Download, RefreshCw, Paperclip } from 'lucide-react'
import { cn, iconButtonClasses } from '@/lib/utils'
import { EstadosTab } from './estados-tab'
import { TransicoesTab } from './transicoes-tab'
import { CrimesTab } from './crimes-tab'
import { ComarcasTab } from './comarcas-tab'
import { TribunaisTab } from './tribunais-tab'
import { SeccoesTab } from './seccoes-tab'
import { BackupsTab } from './backups-tab'
import { NotificacoesTab } from './notificacoes-tab'
import { AtualizacoesTab } from './atualizacoes-tab'
import { AparenciaTab } from './aparencia-tab'
import { EtiquetasTab } from './etiquetas-tab'
import { AjudasConfigTab } from './ajudas-config-tab'

// ─── System config ────────────────────────────────────────────────────────────

const schema = z.object({
  prazoAlertaDias: z.number().int().min(1).max(365),
  backupScheduleCron: z.string().min(1),
  emailRemetenteNome: z.string().min(1),
  emailRemetenteAddr: z.string().email('Email inválido'),
  sessaoTimeoutMinutos: z.number().int().min(0).max(1440),
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

type CategoriaDashboard = 'AGUARDA_EXAMES' | 'ENVIADO' | null

interface AtividadePadrao {
  id: string
  nome: string
  descricao: string | null
  ativa: boolean
  ordem: number
  temPrazo: boolean
  temQuantidade: boolean
  temControlo: boolean
  contaParaEstatistica: boolean
  transicaoEstadoId: string | null
  transicaoEstadoConclusaoId: string | null
  categoriaDashboard: CategoriaDashboard
}

const TRANSICAO_NONE = '__none__'
const CATEGORIA_NONE = '__none__'

const CATEGORIA_DASHBOARD_LABELS: Record<Exclude<CategoriaDashboard, null>, string> = {
  AGUARDA_EXAMES: 'Aguarda exames',
  ENVIADO: 'Enviado',
}

function AtividadesTab({ estados }: { estados: EstadoOption[] }) {
  const [atividades, setAtividades] = useState<AtividadePadrao[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newDescricao, setNewDescricao] = useState('')
  const [newTemPrazo, setNewTemPrazo] = useState(false)
  const [newTemQuantidade, setNewTemQuantidade] = useState(false)
  const [newTemControlo, setNewTemControlo] = useState(false)
  const [newContaParaEstatistica, setNewContaParaEstatistica] = useState(true)
  const [newTransicaoEstadoId, setNewTransicaoEstadoId] = useState<string>('')
  const [newTransicaoEstadoConclusaoId, setNewTransicaoEstadoConclusaoId] = useState<string>('')
  const [newCategoriaDashboard, setNewCategoriaDashboard] = useState<CategoriaDashboard>(null)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editDescricao, setEditDescricao] = useState('')
  const [editTemPrazo, setEditTemPrazo] = useState(false)
  const [editTemQuantidade, setEditTemQuantidade] = useState(false)
  const [editTemControlo, setEditTemControlo] = useState(false)
  const [editContaParaEstatistica, setEditContaParaEstatistica] = useState(true)
  const [editTransicaoEstadoId, setEditTransicaoEstadoId] = useState<string>('')
  const [editTransicaoEstadoConclusaoId, setEditTransicaoEstadoConclusaoId] = useState<string>('')
  const [editCategoriaDashboard, setEditCategoriaDashboard] = useState<CategoriaDashboard>(null)
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
        temControlo: newTemControlo,
        contaParaEstatistica: newContaParaEstatistica,
        transicaoEstadoId: newTransicaoEstadoId || null,
        transicaoEstadoConclusaoId: newTransicaoEstadoConclusaoId || null,
        categoriaDashboard: newCategoriaDashboard,
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
    setNewTemControlo(false)
    setNewContaParaEstatistica(true)
    setNewTransicaoEstadoId('')
    setNewTransicaoEstadoConclusaoId('')
    setNewCategoriaDashboard(null)
    setAdding(false)
    load()
  }

  async function handleToggleField(
    a: AtividadePadrao,
    field: 'ativa' | 'temPrazo' | 'temQuantidade' | 'temControlo' | 'contaParaEstatistica',
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
    setEditTemControlo(a.temControlo)
    setEditContaParaEstatistica(a.contaParaEstatistica)
    setEditTransicaoEstadoId(a.transicaoEstadoId ?? '')
    setEditTransicaoEstadoConclusaoId(a.transicaoEstadoConclusaoId ?? '')
    setEditCategoriaDashboard(a.categoriaDashboard)
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
        temControlo: editTemControlo,
        contaParaEstatistica: editContaParaEstatistica,
        transicaoEstadoId: editTransicaoEstadoId || null,
        transicaoEstadoConclusaoId: editTransicaoEstadoConclusaoId || null,
        categoriaDashboard: editCategoriaDashboard,
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
                  checked={newTemControlo}
                  onChange={(e) => setNewTemControlo(e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                <span>Tem controlo</span>
                <span className="text-xs text-muted-foreground">(pede data, período e alerta ao registar)</span>
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
            <div className="space-y-1.5">
              <Label htmlFor="newTransicaoConclusao">Ao confirmar conclusão, altera estado para</Label>
              <Select
                value={newTransicaoEstadoConclusaoId || TRANSICAO_NONE}
                onValueChange={(v) =>
                  setNewTransicaoEstadoConclusaoId(!v || v === TRANSICAO_NONE ? '' : v)
                }
              >
                <SelectTrigger id="newTransicaoConclusao">
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
                Quando a conclusão desta atividade for confirmada (ex.: confirmar devolução ou
                conclusão de exames), o estado do inquérito passa para o escolhido.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newCategoria">Categoria no Dashboard</Label>
              <Select
                value={newCategoriaDashboard ?? CATEGORIA_NONE}
                onValueChange={(v) =>
                  setNewCategoriaDashboard(!v || v === CATEGORIA_NONE ? null : (v as Exclude<CategoriaDashboard, null>))
                }
              >
                <SelectTrigger id="newCategoria">
                  <SelectValue>
                    {(v: string) => {
                      if (!v || v === CATEGORIA_NONE) return 'Nenhuma'
                      return CATEGORIA_DASHBOARD_LABELS[v as Exclude<CategoriaDashboard, null>] ?? 'Nenhuma'
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CATEGORIA_NONE}>Nenhuma</SelectItem>
                  <SelectItem value="AGUARDA_EXAMES">Aguarda exames</SelectItem>
                  <SelectItem value="ENVIADO">Enviado</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Inquéritos com atividades deste tipo ainda por concluir contam para o cartão
                do Dashboard correspondente.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleAdd} disabled={saving || !newNome.trim()}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Adicionar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                setAdding(false); setNewNome(''); setNewDescricao('')
                setNewTemPrazo(false); setNewTemQuantidade(false); setNewTemControlo(false)
                setNewCategoriaDashboard(null)
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
                      <button onClick={() => handleEditSave(a.id)} className={cn(iconButtonClasses, 'text-green-600')} aria-label="Guardar"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setEditId(null)} className={cn(iconButtonClasses, 'text-muted-foreground')} aria-label="Cancelar edição"><X className="h-4 w-4" /></button>
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
                        checked={editTemControlo}
                        onChange={(e) => setEditTemControlo(e.target.checked)}
                        className="h-4 w-4 rounded border"
                      />
                      <span>Tem controlo</span>
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs text-muted-foreground">Ao confirmar conclusão, altera para</Label>
                    <Select
                      value={editTransicaoEstadoConclusaoId || TRANSICAO_NONE}
                      onValueChange={(v) =>
                        setEditTransicaoEstadoConclusaoId(!v || v === TRANSICAO_NONE ? '' : v)
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs text-muted-foreground">Categoria Dashboard</Label>
                    <Select
                      value={editCategoriaDashboard ?? CATEGORIA_NONE}
                      onValueChange={(v) =>
                        setEditCategoriaDashboard(
                          !v || v === CATEGORIA_NONE ? null : (v as Exclude<CategoriaDashboard, null>),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-[200px] text-xs">
                        <SelectValue>
                          {(v: string) => {
                            if (!v || v === CATEGORIA_NONE) return 'Nenhuma'
                            return CATEGORIA_DASHBOARD_LABELS[v as Exclude<CategoriaDashboard, null>] ?? 'Nenhuma'
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CATEGORIA_NONE}>Nenhuma</SelectItem>
                        <SelectItem value="AGUARDA_EXAMES">Aguarda exames</SelectItem>
                        <SelectItem value="ENVIADO">Enviado</SelectItem>
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
                    {/* Transição na conclusão badge */}
                    {a.transicaoEstadoConclusaoId && (() => {
                      const target = estadoById.get(a.transicaoEstadoConclusaoId)
                      if (!target) return null
                      const corClass = target.cor
                        ? ESTADO_COR_CLASSES[target.cor] ?? ESTADO_COR_DEFAULT
                        : ESTADO_COR_DEFAULT
                      return (
                        <span
                          title={`Ao confirmar a conclusão, altera o estado para «${target.nome}»`}
                          className={cn(
                            'text-xs px-2 py-0.5 rounded-full font-medium border',
                            corClass,
                          )}
                        >
                          ✓→ {target.nome}
                        </span>
                      )
                    })()}
                    {/* Categoria Dashboard badge */}
                    {a.categoriaDashboard && (
                      <span
                        title="Categoria que conta para o cartão do Dashboard"
                        className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
                      >
                        ★ {CATEGORIA_DASHBOARD_LABELS[a.categoriaDashboard]}
                      </span>
                    )}
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
                    {/* Controlo toggle */}
                    <button
                      onClick={() => handleToggleField(a, 'temControlo')}
                      title="Clique para ativar/desativar controlo periódico"
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                        a.temControlo
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-muted text-muted-foreground/60',
                      )}
                    >
                      Controlo
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
                    <button onClick={() => handleEdit(a)} className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')} aria-label={`Editar ${a.nome}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => openDeleteDialog(a)}
                      title="Apagar ou desativar"
                      aria-label={`Apagar ${a.nome}`}
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

type Tab = 'sistema' | 'estados' | 'transicoes' | 'crimes' | 'etiquetas' | 'comarcas' | 'tribunais' | 'seccoes' | 'atividades' | 'notificacoes' | 'backups' | 'atualizacoes' | 'aparencia' | 'ajudas-config'

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('sistema')
  const [estados, setEstados] = useState<EstadoOption[]>([])
  const [estadosDefault, setEstadosDefault] = useState<string[]>([])
  const [savingDefault, setSavingDefault] = useState(false)
  const [moduloAjudasAtivo, setModuloAjudasAtivo] = useState(true)
  const [moduloAjudasRoles, setModuloAjudasRoles] = useState<string[]>(['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR'])
  const [moduloFeriasAtivo, setModuloFeriasAtivo] = useState(true)
  const [moduloFeriasRoles, setModuloFeriasRoles] = useState<string[]>(['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR'])
  const [moduloBugReportsAtivo, setModuloBugReportsAtivo] = useState(true)
  const [moduloBugReportsRoles, setModuloBugReportsRoles] = useState<string[]>(['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR'])
  const [moduloToolboxAtivo, setModuloToolboxAtivo] = useState(true)
  const [moduloToolboxRoles, setModuloToolboxRoles] = useState<string[]>(['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR'])
  const [moduloAnexosAtivo, setModuloAnexosAtivo] = useState(true)
  const [moduloAnexosRoles, setModuloAnexosRoles] = useState<string[]>(['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR'])
  const [moduloAgendaAtivo, setModuloAgendaAtivo] = useState(true)
  const [moduloAgendaRoles, setModuloAgendaRoles] = useState<string[]>(['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR'])
  const [savingModuloAgenda, setSavingModuloAgenda] = useState(false)
  const [savingModuloAnexos, setSavingModuloAnexos] = useState(false)
  const [emailNotificacoesAtivo, setEmailNotificacoesAtivo] = useState(true)
  const [savingEmailNotificacoes, setSavingEmailNotificacoes] = useState(false)
  const [savingModulo, setSavingModulo] = useState(false)
  const [savingModuloFerias, setSavingModuloFerias] = useState(false)
  const [savingModuloBugReports, setSavingModuloBugReports] = useState(false)
  const [savingModuloToolbox, setSavingModuloToolbox] = useState(false)
  // Explicações por IA na Toolbox (LLM local via Ollama).
  const [toolboxIaAtivo, setToolboxIaAtivo] = useState(false)
  const [toolboxIaModelo, setToolboxIaModelo] = useState('qwen3:4b')
  const [savingToolboxIa, setSavingToolboxIa] = useState(false)
  const [iaStatus, setIaStatus] = useState<{ online: boolean; modeloDisponivel: boolean } | null>(null)
  const [checkingIaStatus, setCheckingIaStatus] = useState(false)
  const [pullingModelo, setPullingModelo] = useState(false)
  const [savingRoles, setSavingRoles] = useState(false)
  // Limiar urgente — gerido fora do RHF para lidar com o valor opcional (vazio = null).
  const [prazoUrgente, setPrazoUrgente] = useState('')
  // Configuração SMTP — estado próprio (a palavra-passe vazia = manter inalterada).
  const [smtp, setSmtp] = useState({ host: '', port: '', secure: false, user: '', password: '' })
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false)
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)

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
          sessaoTimeoutMinutos: d.sessaoTimeoutMinutos ?? 0,
        })
        setPrazoUrgente(d.prazoAlertaDiasUrgente != null ? String(d.prazoAlertaDiasUrgente) : '')
        setSmtp({
          host: d.smtpHost ?? '',
          port: d.smtpPort != null ? String(d.smtpPort) : '',
          secure: d.smtpSecure ?? false,
          user: d.smtpUser ?? '',
          password: '',
        })
        setSmtpPasswordSet(!!d.smtpPasswordSet)
        setEstadosDefault(d.inqueritoFiltroEstadosDefault ?? [])
        setModuloAjudasAtivo(d.moduloAjudasAtivo ?? true)
        setModuloAjudasRoles((d.moduloAjudasRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR').split(',').filter(Boolean))
        setModuloFeriasAtivo(d.moduloFeriasAtivo ?? true)
        setModuloFeriasRoles((d.moduloFeriasRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR').split(',').filter(Boolean))
        setModuloBugReportsAtivo(d.moduloBugReportsAtivo ?? true)
        setModuloBugReportsRoles((d.moduloBugReportsRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR').split(',').filter(Boolean))
        setModuloToolboxAtivo(d.moduloToolboxAtivo ?? true)
        setModuloToolboxRoles((d.moduloToolboxRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR').split(',').filter(Boolean))
        setModuloAnexosAtivo(d.moduloAnexosAtivo ?? true)
        setModuloAnexosRoles((d.moduloAnexosRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR').split(',').filter(Boolean))
        setModuloAgendaAtivo(d.moduloAgendaAtivo ?? true)
        setModuloAgendaRoles((d.moduloAgendaRoles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR').split(',').filter(Boolean))
        setToolboxIaAtivo(d.toolboxIaAtivo ?? false)
        setToolboxIaModelo(d.toolboxIaModelo ?? 'qwen3:4b')
        setEmailNotificacoesAtivo(d.emailNotificacoesAtivo ?? true)
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
    const payload = {
      ...data,
      // Vazio = desligar o limiar urgente (null).
      prazoAlertaDiasUrgente: prazoUrgente.trim() === '' ? null : Number(prazoUrgente),
    }
    const res = await fetch('/api/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao guardar')
      return
    }
    toast.success('Configurações guardadas')
  }

  async function saveSmtp() {
    setSavingSmtp(true)
    try {
      // A palavra-passe só é enviada quando o utilizador escreve uma nova
      // (vazia = manter a atual). Para limpar, o utilizador remove host/user.
      const payload: Record<string, unknown> = {
        smtpHost: smtp.host.trim(),
        smtpPort: smtp.port.trim() === '' ? null : Number(smtp.port),
        smtpSecure: smtp.secure,
        smtpUser: smtp.user.trim(),
      }
      if (smtp.password !== '') payload.smtpPassword = smtp.password
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      const updated = await res.json()
      setSmtpPasswordSet(!!updated.smtpPasswordSet)
      setSmtp((s) => ({ ...s, password: '' }))
      toast.success('Configuração SMTP guardada')
    } catch {
      toast.error('Erro ao guardar')
    } finally {
      setSavingSmtp(false)
    }
  }

  async function sendTestEmail() {
    setTestingEmail(true)
    try {
      const res = await fetch('/api/configuracoes/test-email', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Falha ao enviar email de teste')
        return
      }
      toast.success(`Email de teste enviado para ${data.to}`)
    } catch {
      toast.error('Falha ao enviar email de teste')
    } finally {
      setTestingEmail(false)
    }
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

  async function toggleModuloAjudas() {
    const next = !moduloAjudasAtivo
    setSavingModulo(true)
    setModuloAjudasAtivo(next)
    const res = await fetch('/api/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduloAjudasAtivo: next }),
    })
    setSavingModulo(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setModuloAjudasAtivo(!next)
      toast.error(err.error ?? 'Erro ao guardar')
      return
    }
    toast.success(next ? 'Módulo Ajudas Mensais ativado' : 'Módulo Ajudas Mensais desativado')
  }

  async function toggleModuloFerias() {
    const next = !moduloFeriasAtivo
    setSavingModuloFerias(true)
    setModuloFeriasAtivo(next)
    const res = await fetch('/api/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduloFeriasAtivo: next }),
    })
    setSavingModuloFerias(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setModuloFeriasAtivo(!next)
      toast.error(err.error ?? 'Erro ao guardar')
      return
    }
    toast.success(next ? 'Módulo Ausências ativado' : 'Módulo Ausências desativado')
  }

  async function toggleModuloBugReports() {
    const next = !moduloBugReportsAtivo
    setSavingModuloBugReports(true)
    setModuloBugReportsAtivo(next)
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduloBugReportsAtivo: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setModuloBugReportsAtivo(!next)
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success(next ? 'Módulo Reportar Bug ativado' : 'Módulo Reportar Bug desativado')
    } catch {
      setModuloBugReportsAtivo(!next)
      toast.error('Erro de rede ao guardar')
    } finally {
      setSavingModuloBugReports(false)
    }
  }

  async function toggleModuloToolbox() {
    const next = !moduloToolboxAtivo
    setSavingModuloToolbox(true)
    setModuloToolboxAtivo(next)
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduloToolboxAtivo: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setModuloToolboxAtivo(!next)
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success(next ? 'Módulo Toolbox ativado' : 'Módulo Toolbox desativado')
    } catch {
      setModuloToolboxAtivo(!next)
      toast.error('Erro de rede ao guardar')
    } finally {
      setSavingModuloToolbox(false)
    }
  }

  async function toggleToolboxIa() {
    const next = !toolboxIaAtivo
    setSavingToolboxIa(true)
    setToolboxIaAtivo(next)
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolboxIaAtivo: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setToolboxIaAtivo(!next)
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success(next ? 'Explicações por IA ativadas' : 'Explicações por IA desativadas')
    } catch {
      setToolboxIaAtivo(!next)
      toast.error('Erro de rede ao guardar')
    } finally {
      setSavingToolboxIa(false)
    }
  }

  async function saveToolboxIaModelo() {
    const modelo = toolboxIaModelo.trim()
    if (!modelo) {
      toast.error('Indique o nome do modelo (ex: qwen3:4b)')
      return
    }
    setSavingToolboxIa(true)
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolboxIaModelo: modelo }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success('Modelo guardado')
      setIaStatus(null)
    } catch {
      toast.error('Erro de rede ao guardar')
    } finally {
      setSavingToolboxIa(false)
    }
  }

  async function refreshIaStatus() {
    setCheckingIaStatus(true)
    try {
      const res = await fetch('/api/toolbox/ia-status')
      if (!res.ok) {
        toast.error('Erro ao consultar o estado do serviço de IA')
        return
      }
      setIaStatus(await res.json())
    } catch {
      toast.error('Erro de rede')
    } finally {
      setCheckingIaStatus(false)
    }
  }

  async function pullModelo() {
    setPullingModelo(true)
    try {
      const res = await fetch('/api/toolbox/ia-status', { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao descarregar o modelo')
        return
      }
      const data = await res.json().catch(() => ({}))
      if ((data as { emSegundoPlano?: boolean }).emSegundoPlano) {
        toast.success('O download do modelo foi iniciado em segundo plano. Use "Verificar estado" para acompanhar.')
      } else {
        toast.success('Modelo descarregado com sucesso')
      }
      await refreshIaStatus()
    } catch {
      toast.error('Erro de rede ao descarregar o modelo')
    } finally {
      setPullingModelo(false)
    }
  }

  async function toggleModuloAnexos() {
    const next = !moduloAnexosAtivo
    setSavingModuloAnexos(true)
    setModuloAnexosAtivo(next)
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduloAnexosAtivo: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setModuloAnexosAtivo(!next)
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success(next ? 'Módulo Anexos ativado' : 'Módulo Anexos desativado')
    } catch {
      setModuloAnexosAtivo(!next)
      toast.error('Erro de rede ao guardar')
    } finally {
      setSavingModuloAnexos(false)
    }
  }

  async function toggleModuloAgenda() {
    const next = !moduloAgendaAtivo
    setSavingModuloAgenda(true)
    setModuloAgendaAtivo(next)
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduloAgendaAtivo: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setModuloAgendaAtivo(!next)
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success(next ? 'Módulo Agenda ativado' : 'Módulo Agenda desativado')
    } catch {
      setModuloAgendaAtivo(!next)
      toast.error('Erro de rede ao guardar')
    } finally {
      setSavingModuloAgenda(false)
    }
  }

  async function toggleEmailNotificacoes() {
    const next = !emailNotificacoesAtivo
    setSavingEmailNotificacoes(true)
    setEmailNotificacoesAtivo(next)
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailNotificacoesAtivo: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setEmailNotificacoesAtivo(!next)
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success(next ? 'Notificações por email ativadas' : 'Notificações por email desativadas')
    } catch {
      setEmailNotificacoesAtivo(!next)
      toast.error('Erro de rede ao guardar')
    } finally {
      setSavingEmailNotificacoes(false)
    }
  }

  async function toggleModuloRole(modulo: 'ajudas' | 'ferias' | 'bugreports' | 'toolbox' | 'anexos' | 'agenda', role: string) {
    const configMap = {
      ajudas:     { roles: moduloAjudasRoles,     setter: setModuloAjudasRoles,     key: 'moduloAjudasRoles' },
      ferias:     { roles: moduloFeriasRoles,     setter: setModuloFeriasRoles,     key: 'moduloFeriasRoles' },
      bugreports: { roles: moduloBugReportsRoles, setter: setModuloBugReportsRoles, key: 'moduloBugReportsRoles' },
      toolbox:    { roles: moduloToolboxRoles,    setter: setModuloToolboxRoles,    key: 'moduloToolboxRoles' },
      anexos:     { roles: moduloAnexosRoles,     setter: setModuloAnexosRoles,     key: 'moduloAnexosRoles' },
      agenda:     { roles: moduloAgendaRoles,     setter: setModuloAgendaRoles,     key: 'moduloAgendaRoles' },
    } as const
    const { roles: current, setter, key } = configMap[modulo]
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
    setter(next)
    setSavingRoles(true)
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next.join(',') }),
      })
      if (!res.ok) {
        setter(current)
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
      }
    } catch {
      setter(current)
      toast.error('Erro de rede ao guardar')
    } finally {
      setSavingRoles(false)
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">A carregar...</div>

  // All dashboard pages use the full available width; no outer max-width constraint here.
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground text-sm">Configurações do sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-0 flex-wrap">
        {(['sistema', 'estados', 'transicoes', 'crimes', 'etiquetas', 'comarcas', 'tribunais', 'seccoes', 'atividades', 'notificacoes', 'backups', 'atualizacoes', 'aparencia', 'ajudas-config'] as Tab[]).map((t) => (
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
            {t === 'sistema'
              ? 'Sistema'
              : t === 'estados'
                ? 'Estados'
                : t === 'transicoes'
                  ? 'Transições'
                : t === 'crimes'
                  ? 'Crimes'
                  : t === 'etiquetas'
                    ? 'Etiquetas'
                  : t === 'comarcas'
                    ? 'Comarcas'
                    : t === 'tribunais'
                      ? 'Tribunais'
                    : t === 'seccoes'
                      ? 'Secções'
                      : t === 'atividades'
                          ? 'Atividades'
                          : t === 'notificacoes'
                            ? 'Notificações'
                            : t === 'backups'
                              ? 'Backups'
                              : t === 'atualizacoes'
                                ? 'Atualizações'
                                : t === 'aparencia'
                                  ? 'Aparência'
                                  : 'Ajudas'}
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
              <div className="space-y-1.5">
                <Label htmlFor="prazoAlertaDiasUrgente">Aviso urgente com antecedência (dias)</Label>
                <Input
                  id="prazoAlertaDiasUrgente"
                  type="number"
                  min={1}
                  max={365}
                  placeholder="Deixe vazio para desativar"
                  value={prazoUrgente}
                  onChange={(e) => setPrazoUrgente(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Quando o prazo de um inquérito cai dentro deste nº de dias, o Inspetor-Chefe
                  da brigada é também notificado. Vazio = desativado.
                </p>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="sessaoTimeoutMinutos">Timeout por inatividade (minutos)</Label>
                <Input
                  id="sessaoTimeoutMinutos"
                  type="number"
                  min={0}
                  max={1440}
                  {...register('sessaoTimeoutMinutos', { valueAsNumber: true })}
                />
                <p className="text-xs text-muted-foreground">
                  Termina a sessão após este período de inatividade. 0 desativa a funcionalidade.
                </p>
                {errors.sessaoTimeoutMinutos && (
                  <p className="text-xs text-red-600">{errors.sessaoTimeoutMinutos.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar configurações
          </Button>
        </form>
      )}

      {tab === 'sistema' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Servidor de email (SMTP)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Defina o servidor SMTP usado para enviar emails (notificações, recuperação
              de password). Se deixar o servidor vazio, são usadas as variáveis de ambiente.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="smtpHost">Servidor</Label>
                <Input
                  id="smtpHost"
                  placeholder="ex: smtp.gmail.com"
                  value={smtp.host}
                  onChange={(e) => setSmtp((s) => ({ ...s, host: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtpPort">Porta</Label>
                <Input
                  id="smtpPort"
                  type="number"
                  min={1}
                  max={65535}
                  placeholder="587"
                  value={smtp.port}
                  onChange={(e) => setSmtp((s) => ({ ...s, port: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtpUser">Utilizador</Label>
              <Input
                id="smtpUser"
                autoComplete="off"
                placeholder="(opcional)"
                value={smtp.user}
                onChange={(e) => setSmtp((s) => ({ ...s, user: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtpPassword">Palavra-passe</Label>
              <Input
                id="smtpPassword"
                type="password"
                autoComplete="new-password"
                placeholder={smtpPasswordSet ? '•••••••• (definida — deixe vazio para manter)' : '(opcional)'}
                value={smtp.password}
                onChange={(e) => setSmtp((s) => ({ ...s, password: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={smtp.secure}
                onChange={(e) => setSmtp((s) => ({ ...s, secure: e.target.checked }))}
                className="h-4 w-4 rounded border"
              />
              <span>Usar TLS/SSL (porta 465)</span>
            </label>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={saveSmtp} disabled={savingSmtp}>
                {savingSmtp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar SMTP
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={sendTestEmail} disabled={testingEmail}>
                {testingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Enviar email de teste
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'sistema' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Módulos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-lg',
                    moduloAjudasAtivo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground',
                  )}>
                    <Banknote className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Ajudas Mensais</p>
                    <p className="text-xs text-muted-foreground">
                      Registo de horas extra, prevenção e ajudas de custo
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleModuloAjudas}
                  disabled={savingModulo}
                  aria-label={moduloAjudasAtivo ? 'Desativar módulo Ajudas Mensais' : 'Ativar módulo Ajudas Mensais'}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                    moduloAjudasAtivo ? 'bg-green-600' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
                      moduloAjudasAtivo ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              {moduloAjudasAtivo && (
                <ModuloRoleSelector
                  roles={moduloAjudasRoles}
                  disabled={savingRoles}
                  onToggle={(r) => toggleModuloRole('ajudas', r)}
                />
              )}
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-lg',
                    moduloFeriasAtivo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground',
                  )}>
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Ausências</p>
                    <p className="text-xs text-muted-foreground">
                      Marcação de ausências e folgas por inspetor
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleModuloFerias}
                  disabled={savingModuloFerias}
                  aria-label={moduloFeriasAtivo ? 'Desativar módulo Ausências' : 'Ativar módulo Ausências'}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                    moduloFeriasAtivo ? 'bg-green-600' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
                      moduloFeriasAtivo ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              {moduloFeriasAtivo && (
                <ModuloRoleSelector
                  roles={moduloFeriasRoles}
                  disabled={savingRoles}
                  onToggle={(r) => toggleModuloRole('ferias', r)}
                />
              )}
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-lg',
                    moduloBugReportsAtivo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground',
                  )}>
                    <Bug className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Reportar Bug</p>
                    <p className="text-xs text-muted-foreground">
                      Permite aos utilizadores reportar problemas ao administrador
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleModuloBugReports}
                  disabled={savingModuloBugReports}
                  aria-label={moduloBugReportsAtivo ? 'Desativar módulo Reportar Bug' : 'Ativar módulo Reportar Bug'}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                    moduloBugReportsAtivo ? 'bg-green-600' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
                      moduloBugReportsAtivo ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              {moduloBugReportsAtivo && (
                <ModuloRoleSelector
                  roles={moduloBugReportsRoles}
                  disabled={savingRoles}
                  onToggle={(r) => toggleModuloRole('bugreports', r)}
                />
              )}
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-lg',
                    moduloToolboxAtivo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground',
                  )}>
                    <Wrench className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Toolbox</p>
                    <p className="text-xs text-muted-foreground">
                      Ferramentas de investigação: IP lookup, análise de emails, DNS, WHOIS
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleModuloToolbox}
                  disabled={savingModuloToolbox}
                  aria-label={moduloToolboxAtivo ? 'Desativar módulo Toolbox' : 'Ativar módulo Toolbox'}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                    moduloToolboxAtivo ? 'bg-green-600' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
                      moduloToolboxAtivo ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              {moduloToolboxAtivo && (
                <ModuloRoleSelector
                  roles={moduloToolboxRoles}
                  disabled={savingRoles}
                  onToggle={(r) => toggleModuloRole('toolbox', r)}
                />
              )}
              {moduloToolboxAtivo && (
                <div className="ml-12 mt-2 rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-violet-600" />
                      <div>
                        <p className="text-sm font-medium">Explicações por IA</p>
                        <p className="text-xs text-muted-foreground">
                          LLM local (Ollama) explica os resultados das ferramentas — os dados não saem do servidor
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={toggleToolboxIa}
                      disabled={savingToolboxIa}
                      aria-label={toolboxIaAtivo ? 'Desativar explicações por IA' : 'Ativar explicações por IA'}
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                        toolboxIaAtivo ? 'bg-green-600' : 'bg-input',
                      )}
                    >
                      <span
                        className={cn(
                          'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
                          toolboxIaAtivo ? 'translate-x-5' : 'translate-x-0',
                        )}
                      />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="cfg-ia-modelo" className="text-xs">Modelo Ollama</Label>
                      <Input
                        id="cfg-ia-modelo"
                        value={toolboxIaModelo}
                        onChange={(e) => setToolboxIaModelo(e.target.value)}
                        placeholder="qwen3:4b"
                        className="h-8 w-44 font-mono text-xs"
                      />
                    </div>
                    <Button size="sm" variant="outline" onClick={saveToolboxIaModelo} disabled={savingToolboxIa}>
                      Guardar modelo
                    </Button>
                    <Button size="sm" variant="outline" onClick={refreshIaStatus} disabled={checkingIaStatus} className="gap-1.5">
                      {checkingIaStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Verificar estado
                    </Button>
                    <Button size="sm" variant="outline" onClick={pullModelo} disabled={pullingModelo} className="gap-1.5">
                      {pullingModelo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      {pullingModelo ? 'A descarregar (vários minutos)…' : 'Descarregar modelo'}
                    </Button>
                  </div>
                  {iaStatus && (
                    <p className="text-xs">
                      {iaStatus.online ? (
                        <>
                          <span className="text-green-700 dark:text-green-400 font-medium">Ollama online</span>
                          {' · '}
                          {iaStatus.modeloDisponivel ? (
                            <span className="text-green-700 dark:text-green-400">modelo disponível</span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">modelo não descarregado — use &quot;Descarregar modelo&quot;</span>
                          )}
                        </>
                      ) : (
                        <span className="text-red-700 dark:text-red-400 font-medium">
                          Ollama offline — verifique o container gpi_ollama
                        </span>
                      )}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Requer ≈ 4 GB de RAM livres com o modelo recomendado (qwen3:4b). A primeira resposta após
                    inatividade é mais lenta (carregamento do modelo).
                  </p>
                </div>
              )}
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-lg',
                    moduloAnexosAtivo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground',
                  )}>
                    <Paperclip className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Anexos</p>
                    <p className="text-xs text-muted-foreground">
                      Documentos anexados a inquéritos (provas, relatórios, ofícios)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleModuloAnexos}
                  disabled={savingModuloAnexos}
                  aria-label={moduloAnexosAtivo ? 'Desativar módulo Anexos' : 'Ativar módulo Anexos'}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                    moduloAnexosAtivo ? 'bg-green-600' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
                      moduloAnexosAtivo ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              {moduloAnexosAtivo && (
                <ModuloRoleSelector
                  roles={moduloAnexosRoles}
                  disabled={savingRoles}
                  onToggle={(r) => toggleModuloRole('anexos', r)}
                />
              )}
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-lg',
                    moduloAgendaAtivo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground',
                  )}>
                    <CalendarCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Agenda</p>
                    <p className="text-xs text-muted-foreground">
                      Vista de calendário: prazos, atividades, controlos e diligências (datas de tribunal)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleModuloAgenda}
                  disabled={savingModuloAgenda}
                  aria-label={moduloAgendaAtivo ? 'Desativar módulo Agenda' : 'Ativar módulo Agenda'}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                    moduloAgendaAtivo ? 'bg-green-600' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
                      moduloAgendaAtivo ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
              {moduloAgendaAtivo && (
                <ModuloRoleSelector
                  roles={moduloAgendaRoles}
                  disabled={savingRoles}
                  onToggle={(r) => toggleModuloRole('agenda', r)}
                />
              )}
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-lg',
                    emailNotificacoesAtivo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground',
                  )}>
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Notificações por email</p>
                    <p className="text-xs text-muted-foreground">
                      Envio de emails para notificações do sistema (em fase de testes)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleEmailNotificacoes}
                  disabled={savingEmailNotificacoes}
                  aria-label={emailNotificacoesAtivo ? 'Desativar notificações por email' : 'Ativar notificações por email'}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                    emailNotificacoesAtivo ? 'bg-green-600' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
                      emailNotificacoesAtivo ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Estados tab */}
      {tab === 'estados' && <EstadosTab />}

      {/* Transições automáticas tab */}
      {tab === 'transicoes' && <TransicoesTab />}

      {/* Crimes tab */}
      {tab === 'crimes' && <CrimesTab />}

      {/* Etiquetas tab */}
      {tab === 'etiquetas' && <EtiquetasTab />}

      {/* Comarcas tab */}
      {tab === 'comarcas' && <ComarcasTab />}

      {/* Tribunais tab */}
      {tab === 'tribunais' && <TribunaisTab />}

      {/* Secções tab */}
      {tab === 'seccoes' && <SeccoesTab />}

      {/* Atividades tab */}
      {tab === 'atividades' && <AtividadesTab estados={estados} />}

      {/* Notificações tab */}
      {tab === 'notificacoes' && <NotificacoesTab />}

      {/* Backups tab */}
      {tab === 'backups' && <BackupsTab />}

      {/* Atualizações tab */}
      {tab === 'atualizacoes' && <AtualizacoesTab />}

      {/* Aparência tab */}
      {tab === 'aparencia' && <AparenciaTab />}

      {/* Ajudas config tab */}
      {tab === 'ajudas-config' && <AjudasConfigTab />}
    </div>
  )
}

const ROLE_LABELS: Record<string, string> = {
  INSPETOR: 'Inspetor',
  INSPETOR_CHEFE: 'Inspetor Chefe',
  COORDENADOR: 'Coordenador',
}
const SELECTABLE_ROLES = ['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR']

function ModuloRoleSelector({
  roles,
  disabled,
  onToggle,
}: {
  roles: string[]
  disabled: boolean
  onToggle: (role: string) => void
}) {
  return (
    <div className="pl-12 space-y-1.5">
      <p className="text-xs text-muted-foreground">Perfis com acesso:</p>
      <div className="flex flex-wrap gap-1.5">
        {SELECTABLE_ROLES.map((r) => {
          const active = roles.includes(r)
          return (
            <button
              key={r}
              type="button"
              onClick={() => onToggle(r)}
              disabled={disabled}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground',
              )}
            >
              {ROLE_LABELS[r]}
            </button>
          )
        })}
        <span className="rounded-full px-2.5 py-0.5 text-xs font-medium border bg-muted text-muted-foreground opacity-60 cursor-default select-none">
          Administração ✓
        </span>
      </div>
    </div>
  )
}
