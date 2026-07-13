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
import { Microscope, Plus, Trash2, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'
import {
  TIPO_PERICIA,
  ESTADO_PERICIA,
  TIPO_PERICIA_LABEL,
  ESTADO_PERICIA_LABEL,
  ESTADO_PERICIA_TERMINAL,
} from '@/lib/validations/pericia'

export interface PericiaItem {
  id: string
  tipo: string
  tipoOutro: string | null
  descricao: string
  entidade: string | null
  numeroReferencia: string | null
  dataPedido: string
  dataPrevista: string | null
  estado: string
  dataConclusao: string | null
  resultado: string | null
  observacoes: string | null
  apreensaoId: string | null
  apreensao: { id: string; descricao: string } | null
}

interface ApreensaoOpcao {
  id: string
  descricao: string
}

interface Props {
  nuipcSlug: string
  pericias: PericiaItem[]
  apreensoesDisponiveis: ApreensaoOpcao[]
  podeGerir: boolean
}

interface FormState {
  tipo: string
  tipoOutro: string
  descricao: string
  entidade: string
  numeroReferencia: string
  dataPedido: string
  dataPrevista: string
  estado: string
  dataConclusao: string
  resultado: string
  observacoes: string
  apreensaoId: string
}

function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY: FormState = {
  tipo: '',
  tipoOutro: '',
  descricao: '',
  entidade: '',
  numeroReferencia: '',
  dataPedido: hojeISO(),
  dataPrevista: '',
  estado: 'SOLICITADA',
  dataConclusao: '',
  resultado: '',
  observacoes: '',
  apreensaoId: '',
}

function toForm(p: PericiaItem): FormState {
  return {
    tipo: p.tipo,
    tipoOutro: p.tipoOutro ?? '',
    descricao: p.descricao,
    entidade: p.entidade ?? '',
    numeroReferencia: p.numeroReferencia ?? '',
    dataPedido: p.dataPedido ? p.dataPedido.slice(0, 10) : '',
    dataPrevista: p.dataPrevista ? p.dataPrevista.slice(0, 10) : '',
    estado: p.estado,
    dataConclusao: p.dataConclusao ? p.dataConclusao.slice(0, 10) : '',
    resultado: p.resultado ?? '',
    observacoes: p.observacoes ?? '',
    apreensaoId: p.apreensaoId ?? '',
  }
}

function tipoLabel(p: PericiaItem): string {
  if (p.tipo === 'OUTRO') return p.tipoOutro?.trim() || 'Outra'
  return TIPO_PERICIA_LABEL[p.tipo as keyof typeof TIPO_PERICIA_LABEL] ?? p.tipo
}

function estadoVariant(estado: string): 'secondary' | 'outline' | 'default' {
  if (estado === 'EM_CURSO') return 'default'
  if (estado === 'SOLICITADA') return 'secondary'
  return 'outline' // terminais (concluída / cancelada)
}

const NENHUMA = '__none__'

export function PericiasSection({ nuipcSlug, pericias, apreensoesDisponiveis, podeGerir }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  if (!podeGerir && pericias.length === 0) return null

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function openCreate() {
    setEditId(null)
    setForm(EMPTY)
    setOpen(true)
  }
  function openEdit(p: PericiaItem) {
    setEditId(p.id)
    setForm(toForm(p))
    setOpen(true)
  }

  const isTerminal = ESTADO_PERICIA_TERMINAL.has(form.estado)

  async function handleSave() {
    if (!form.tipo) return toast.error('Selecione o tipo')
    if (form.tipo === 'OUTRO' && !form.tipoOutro.trim()) return toast.error('Descreva o tipo')
    if (!form.descricao.trim()) return toast.error('Descreva a perícia')
    if (!form.dataPedido) return toast.error('Indique a data do pedido')
    setSaving(true)
    try {
      const payload = {
        tipo: form.tipo,
        tipoOutro: form.tipo === 'OUTRO' ? form.tipoOutro.trim() || undefined : undefined,
        descricao: form.descricao.trim(),
        entidade: form.entidade.trim() || undefined,
        numeroReferencia: form.numeroReferencia.trim() || undefined,
        dataPedido: form.dataPedido,
        dataPrevista: form.dataPrevista || undefined,
        estado: form.estado,
        // A conclusão só se envia para estados terminais (evita 400 ao reabrir).
        dataConclusao: isTerminal ? form.dataConclusao || undefined : undefined,
        resultado: form.resultado.trim() || undefined,
        observacoes: form.observacoes.trim() || undefined,
        apreensaoId: form.apreensaoId || undefined,
      }
      const url = editId
        ? `/api/inqueritos/${nuipcSlug}/pericias/${editId}`
        : `/api/inqueritos/${nuipcSlug}/pericias`
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
      toast.success(editId ? 'Perícia atualizada' : 'Perícia registada')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(p: PericiaItem) {
    if (!confirm(`Remover a perícia "${p.descricao}"?`)) return
    setRemoving(p.id)
    try {
      const res = await fetch(`/api/inqueritos/${nuipcSlug}/pericias/${p.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao remover')
        return
      }
      toast.success('Perícia removida')
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Microscope className="h-4 w-4" />
            Perícias
          </CardTitle>
          <div className="flex items-center gap-1">
            <HelpButton title="Ajuda — Perícias" className="shrink-0">
              <HelpSection title="O que é">
                <p>
                  Registo dos exames técnicos/científicos pedidos a entidades externas (LPC,
                  INML, …) — tipo, entidade, referência, datas, estado e resultado. Pode ligar-se
                  ao objeto apreendido examinado.
                </p>
              </HelpSection>
              <HelpSection title="Lembrete">
                <p>
                  Quando a data prevista de conclusão passa e a perícia continua por concluir, o
                  inspetor do inquérito recebe um aviso automático.
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
        {pericias.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem perícias registadas.</p>
        ) : (
          <ul className="divide-y">
            {pericias.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="shrink-0">{tipoLabel(p)}</Badge>
                    <span className="font-medium text-sm truncate">{p.descricao}</span>
                    <Badge variant={estadoVariant(p.estado)} className="shrink-0">
                      {ESTADO_PERICIA_LABEL[p.estado as keyof typeof ESTADO_PERICIA_LABEL] ?? p.estado}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {[
                      p.entidade,
                      p.numeroReferencia ? `Ref. ${p.numeroReferencia}` : null,
                      `Pedida em ${formatDate(p.dataPedido)}`,
                      p.dataPrevista ? `Prevista ${formatDate(p.dataPrevista)}` : null,
                      p.apreensao ? `Sobre: ${p.apreensao.descricao}` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  {p.resultado && (
                    <p className="text-xs text-muted-foreground mt-0.5">Resultado: {p.resultado}</p>
                  )}
                  {p.observacoes && (
                    <p className="text-xs text-muted-foreground mt-0.5">{p.observacoes}</p>
                  )}
                </div>
                {podeGerir && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      title="Editar perícia"
                      aria-label={`Editar ${p.descricao}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemove(p)}
                      disabled={removing === p.id}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                      title="Remover perícia"
                      aria-label={`Remover ${p.descricao}`}
                    >
                      {removing === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
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
            <DialogTitle>{editId ? 'Editar perícia' : 'Nova perícia'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="pcDescricao">Objeto / objetivo da perícia *</Label>
              <Input id="pcDescricao" value={form.descricao} onChange={(e) => set('descricao', e.target.value)} maxLength={500} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => v && set('tipo', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Escolher…">
                      {(v: string | null) => (v ? TIPO_PERICIA_LABEL[v as keyof typeof TIPO_PERICIA_LABEL] : 'Escolher…')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_PERICIA.map((t) => (
                      <SelectItem key={t} value={t}>{TIPO_PERICIA_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={form.estado} onValueChange={(v) => v && set('estado', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string | null) => (v ? ESTADO_PERICIA_LABEL[v as keyof typeof ESTADO_PERICIA_LABEL] : 'Solicitada')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADO_PERICIA.map((e) => (
                      <SelectItem key={e} value={e}>{ESTADO_PERICIA_LABEL[e]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.tipo === 'OUTRO' && (
              <div className="space-y-1.5">
                <Label htmlFor="pcTipoOutro">Descrição do tipo *</Label>
                <Input id="pcTipoOutro" value={form.tipoOutro} onChange={(e) => set('tipoOutro', e.target.value)} maxLength={80} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pcEntidade">Entidade</Label>
                <Input id="pcEntidade" value={form.entidade} onChange={(e) => set('entidade', e.target.value)} placeholder="LPC, INML, …" maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pcRef">Nº de referência</Label>
                <Input id="pcRef" value={form.numeroReferencia} onChange={(e) => set('numeroReferencia', e.target.value)} maxLength={80} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pcDataPedido">Data do pedido *</Label>
                <Input id="pcDataPedido" type="date" value={form.dataPedido} max={hojeISO()} onChange={(e) => set('dataPedido', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pcDataPrevista">Data prevista</Label>
                <Input id="pcDataPrevista" type="date" value={form.dataPrevista} onChange={(e) => set('dataPrevista', e.target.value)} />
              </div>
            </div>

            {apreensoesDisponiveis.length > 0 && (
              <div className="space-y-1.5">
                <Label>Objeto apreendido (opcional)</Label>
                <Select
                  value={form.apreensaoId || NENHUMA}
                  onValueChange={(v) => set('apreensaoId', v === NENHUMA ? '' : (v ?? ''))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string | null) => {
                        if (!v || v === NENHUMA) return 'Nenhum'
                        const a = apreensoesDisponiveis.find((x) => x.id === v)
                        return a ? a.descricao : 'Nenhum'
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUMA}>Nenhum</SelectItem>
                    {apreensoesDisponiveis.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isTerminal && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pcDataConclusao">Data de conclusão</Label>
                  <Input id="pcDataConclusao" type="date" value={form.dataConclusao} onChange={(e) => set('dataConclusao', e.target.value)} />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="pcResultado">Resultado / conclusões</Label>
              <Textarea id="pcResultado" value={form.resultado} onChange={(e) => set('resultado', e.target.value)} maxLength={2000} rows={2} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pcObs">Observações</Label>
              <Textarea id="pcObs" value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} maxLength={2000} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editId ? 'Guardar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
