'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { Boxes, Plus, Trash2, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'
import {
  TIPO_APREENSAO,
  ESTADO_APREENSAO,
  TIPO_APREENSAO_LABEL,
  ESTADO_APREENSAO_LABEL,
  ESTADO_APREENSAO_TERMINAL,
} from '@/lib/validations/apreensao'

export interface ApreensaoItem {
  id: string
  descricao: string
  tipo: string
  tipoOutro: string | null
  quantidade: string | null
  numeroAuto: string | null
  dataApreensao: string
  local: string | null
  apreendidoA: string | null
  localCustodia: string | null
  estado: string
  dataDestino: string | null
  observacoes: string | null
}

interface Props {
  nuipcSlug: string
  apreensoes: ApreensaoItem[]
  podeGerir: boolean
}

interface FormState {
  descricao: string
  tipo: string
  tipoOutro: string
  quantidade: string
  numeroAuto: string
  dataApreensao: string
  local: string
  apreendidoA: string
  localCustodia: string
  estado: string
  dataDestino: string
  observacoes: string
}

function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY: FormState = {
  descricao: '',
  tipo: '',
  tipoOutro: '',
  quantidade: '',
  numeroAuto: '',
  dataApreensao: hojeISO(),
  local: '',
  apreendidoA: '',
  localCustodia: '',
  estado: 'EM_CUSTODIA',
  dataDestino: '',
  observacoes: '',
}

function toForm(a: ApreensaoItem): FormState {
  return {
    descricao: a.descricao,
    tipo: a.tipo,
    tipoOutro: a.tipoOutro ?? '',
    quantidade: a.quantidade ?? '',
    numeroAuto: a.numeroAuto ?? '',
    dataApreensao: a.dataApreensao ? a.dataApreensao.slice(0, 10) : '',
    local: a.local ?? '',
    apreendidoA: a.apreendidoA ?? '',
    localCustodia: a.localCustodia ?? '',
    estado: a.estado,
    dataDestino: a.dataDestino ? a.dataDestino.slice(0, 10) : '',
    observacoes: a.observacoes ?? '',
  }
}

function tipoLabel(a: ApreensaoItem): string {
  if (a.tipo === 'OUTRO') return a.tipoOutro?.trim() || 'Outro'
  return TIPO_APREENSAO_LABEL[a.tipo as keyof typeof TIPO_APREENSAO_LABEL] ?? a.tipo
}

function estadoVariant(estado: string): 'secondary' | 'outline' | 'default' {
  if (estado === 'EM_CUSTODIA') return 'default'
  if (estado === 'A_AGUARDAR_EXAME') return 'secondary'
  return 'outline' // terminais (com destino dado)
}

export function ApreensoesSection({ nuipcSlug, apreensoes, podeGerir }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  if (!podeGerir && apreensoes.length === 0) return null

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function openCreate() {
    setEditId(null)
    setForm(EMPTY)
    setOpen(true)
  }
  function openEdit(a: ApreensaoItem) {
    setEditId(a.id)
    setForm(toForm(a))
    setOpen(true)
  }

  async function handleSave() {
    if (!form.descricao.trim()) return toast.error('Descreva o objeto apreendido')
    if (!form.tipo) return toast.error('Selecione o tipo')
    if (form.tipo === 'OUTRO' && !form.tipoOutro.trim()) return toast.error('Descreva o tipo')
    if (!form.dataApreensao) return toast.error('Indique a data da apreensão')
    setSaving(true)
    try {
      const payload = {
        descricao: form.descricao.trim(),
        tipo: form.tipo,
        tipoOutro: form.tipo === 'OUTRO' ? form.tipoOutro.trim() || undefined : undefined,
        quantidade: form.quantidade.trim() || undefined,
        numeroAuto: form.numeroAuto.trim() || undefined,
        dataApreensao: form.dataApreensao,
        local: form.local.trim() || undefined,
        apreendidoA: form.apreendidoA.trim() || undefined,
        localCustodia: form.localCustodia.trim() || undefined,
        estado: form.estado,
        dataDestino: form.dataDestino || undefined,
        observacoes: form.observacoes.trim() || undefined,
      }
      const url = editId
        ? `/api/inqueritos/${nuipcSlug}/apreensoes/${editId}`
        : `/api/inqueritos/${nuipcSlug}/apreensoes`
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success(editId ? 'Apreensão atualizada' : 'Apreensão registada')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(a: ApreensaoItem) {
    if (!confirm(`Remover a apreensão "${a.descricao}"?`)) return
    setRemoving(a.id)
    try {
      const res = await fetch(`/api/inqueritos/${nuipcSlug}/apreensoes/${a.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao remover')
        return
      }
      toast.success('Apreensão removida')
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setRemoving(null)
    }
  }

  const isTerminal = ESTADO_APREENSAO_TERMINAL.has(form.estado)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Boxes className="h-4 w-4" />
            Apreensões
          </CardTitle>
          <div className="flex items-center gap-1">
            <HelpButton title="Ajuda — Apreensões" className="shrink-0">
              <HelpSection title="O que é">
                <p>
                  Registo dos objetos apreendidos no inquérito e da sua cadeia de custódia — o
                  quê, quando, a quem, onde está guardado e qual o destino (devolução, perda a
                  favor do Estado, destruição).
                </p>
              </HelpSection>
              <HelpSection title="Lembrete">
                <p>
                  Objetos em custódia há muito tempo sem destino geram um aviso automático ao
                  inspetor do inquérito.
                </p>
              </HelpSection>
            </HelpButton>
            {podeGerir && (
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {apreensoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem apreensões registadas.</p>
        ) : (
          <ul className="divide-y">
            {apreensoes.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="shrink-0">{tipoLabel(a)}</Badge>
                    <span className="font-medium text-sm truncate">{a.descricao}</span>
                    <Badge variant={estadoVariant(a.estado)} className="shrink-0">
                      {ESTADO_APREENSAO_LABEL[a.estado as keyof typeof ESTADO_APREENSAO_LABEL] ?? a.estado}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {[
                      a.quantidade,
                      a.numeroAuto ? `Auto ${a.numeroAuto}` : null,
                      `Apreendido em ${formatDate(a.dataApreensao)}`,
                      a.localCustodia ? `Custódia: ${a.localCustodia}` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  {a.observacoes && (
                    <p className="text-xs text-muted-foreground mt-0.5">{a.observacoes}</p>
                  )}
                </div>
                {podeGerir && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => openEdit(a)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      title="Editar apreensão"
                      aria-label={`Editar ${a.descricao}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemove(a)}
                      disabled={removing === a.id}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                      title="Remover apreensão"
                      aria-label={`Remover ${a.descricao}`}
                    >
                      {removing === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar apreensão' : 'Nova apreensão'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="apDescricao">Objeto apreendido *</Label>
              <Input id="apDescricao" value={form.descricao} onChange={(e) => set('descricao', e.target.value)} maxLength={500} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => v && set('tipo', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Escolher…">
                      {(v: string | null) => (v ? TIPO_APREENSAO_LABEL[v as keyof typeof TIPO_APREENSAO_LABEL] : 'Escolher…')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_APREENSAO.map((t) => (
                      <SelectItem key={t} value={t}>{TIPO_APREENSAO_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={form.estado} onValueChange={(v) => v && set('estado', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string | null) => (v ? ESTADO_APREENSAO_LABEL[v as keyof typeof ESTADO_APREENSAO_LABEL] : 'Em custódia')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADO_APREENSAO.map((e) => (
                      <SelectItem key={e} value={e}>{ESTADO_APREENSAO_LABEL[e]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.tipo === 'OUTRO' && (
              <div className="space-y-1.5">
                <Label htmlFor="apTipoOutro">Descrição do tipo *</Label>
                <Input id="apTipoOutro" value={form.tipoOutro} onChange={(e) => set('tipoOutro', e.target.value)} maxLength={80} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="apData">Data da apreensão *</Label>
                <Input id="apData" type="date" value={form.dataApreensao} max={hojeISO()} onChange={(e) => set('dataApreensao', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="apAuto">Nº do auto</Label>
                <Input id="apAuto" value={form.numeroAuto} onChange={(e) => set('numeroAuto', e.target.value)} maxLength={60} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="apQtd">Quantidade</Label>
                <Input id="apQtd" placeholder="Ex.: 3 unidades, 250 g" value={form.quantidade} onChange={(e) => set('quantidade', e.target.value)} maxLength={60} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="apLocal">Local da apreensão</Label>
                <Input id="apLocal" value={form.local} onChange={(e) => set('local', e.target.value)} maxLength={200} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="apA">Apreendido a</Label>
                <Input id="apA" value={form.apreendidoA} onChange={(e) => set('apreendidoA', e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="apCust">Local de custódia</Label>
                <Input id="apCust" placeholder="Cofre / depósito" value={form.localCustodia} onChange={(e) => set('localCustodia', e.target.value)} maxLength={200} />
              </div>
            </div>

            {isTerminal && (
              <div className="space-y-1.5">
                <Label htmlFor="apDestino">Data do destino (devolução/perda/destruição)</Label>
                <Input id="apDestino" type="date" value={form.dataDestino} onChange={(e) => set('dataDestino', e.target.value)} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="apObs">Observações</Label>
              <Textarea id="apObs" value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} maxLength={2000} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editId ? 'Guardar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
