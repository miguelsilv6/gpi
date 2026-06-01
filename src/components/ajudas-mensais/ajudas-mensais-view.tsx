'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import { cn, iconButtonClasses } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import type { AjudasTotais, ConfigData } from '@/lib/ajudas-calc'
import type { Role } from '@/generated/prisma/enums'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AjudasLinha {
  id: string
  registoId: string
  nuipc: string | null
  local: string | null
  dataInicio: string
  dataFim: string
  prevencao: 'NENHUMA' | 'PIQUETE' | 'PREVENCAO_PASSIVA'
  ajudaCustoAlmoco: number
  ajudaCustoJantar: number
  ajudaCustoAlojamento: number
  senhaAlmoco: number
  senhaJantar: number
  senhaCeia: number
  viatura: 'PROPRIA' | 'BRIGADA' | null
  km: number
  observacoes: string | null
}

interface AjudasRegisto {
  id: string
  utilizadorId: string
  ano: number
  mes: number
  linhas: AjudasLinha[]
}

interface ApiResponse {
  registo: AjudasRegisto
  config: ConfigData
  totais: AjudasTotais
}

interface LinhaFormData {
  nuipc: string
  local: string
  dataInicio: string
  dataFim: string
  prevencao: 'NENHUMA' | 'PIQUETE' | 'PREVENCAO_PASSIVA'
  ajudaCustoAlmoco: number
  ajudaCustoJantar: number
  ajudaCustoAlojamento: number
  senhaAlmoco: number
  senhaJantar: number
  senhaCeia: number
  viatura: 'PROPRIA' | 'BRIGADA' | ''
  km: number
  observacoes: string
}

interface Props {
  initialAno: number
  initialMes: number
  userId: string
  initialViewingUserId: string | null
  userRole: Role
  canViewAll: boolean
  canViewBrigade: boolean
  canManageConfig: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function fmt2(n: number) {
  return n.toFixed(2)
}

function fmtEur(n: number) {
  return `€${fmt2(n)}`
}

function formatDT(dt: string) {
  const d = new Date(dt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function calcDuration(inicio: string, fim: string): string {
  const ms = new Date(fim).getTime() - new Date(inicio).getTime()
  if (ms <= 0) return '—'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}m`
}

function toDatetimeLocal(dt: string): string {
  // Convert ISO string to datetime-local input format
  const d = new Date(dt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const EMPTY_FORM: LinhaFormData = {
  nuipc: '',
  local: '',
  dataInicio: '',
  dataFim: '',
  prevencao: 'NENHUMA',
  ajudaCustoAlmoco: 0,
  ajudaCustoJantar: 0,
  ajudaCustoAlojamento: 0,
  senhaAlmoco: 0,
  senhaJantar: 0,
  senhaCeia: 0,
  viatura: '',
  km: 0,
  observacoes: '',
}

// ─── Summary Panel ────────────────────────────────────────────────────────────

function SummaryPanel({ totais }: { totais: AjudasTotais }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
      <h3 className="font-semibold text-base">Resumo do Mês</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: Horas Extra */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Horas Extra</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Semana 08-24h ({totais.semanaDia}h × {fmtEur(totais.taxaSemanaDia)})</span>
              <span className="font-medium">{fmtEur(totais.totalSemanaDia)}</span>
            </div>
            <div className="flex justify-between">
              <span>Semana 00-08h ({totais.semanaNoite}h × {fmtEur(totais.taxaSemanaNoite)})</span>
              <span className="font-medium">{fmtEur(totais.totalSemanaNoite)}</span>
            </div>
            <div className="flex justify-between">
              <span>FdS/Feriado 08-24h ({totais.fdsDia}h × {fmtEur(totais.taxaFdsDia)})</span>
              <span className="font-medium">{fmtEur(totais.totalFdsDia)}</span>
            </div>
            <div className="flex justify-between">
              <span>FdS/Feriado 00-08h ({totais.fdsNoite}h × {fmtEur(totais.taxaFdsNoite)})</span>
              <span className="font-medium">{fmtEur(totais.totalFdsNoite)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1 mt-1">
              <span>Subtotal horas extra</span>
              <span>{fmtEur(totais.totalHorasExtra)}</span>
            </div>
          </div>
        </div>

        {/* Column 2: Prevenção + Ajudas */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Prevenção / Ajudas</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Piquete Semana ({totais.piqueteSemana} × {fmtEur(totais.taxaPiqueteSemana)})</span>
              <span className="font-medium">{fmtEur(totais.totalPiqueteSemana)}</span>
            </div>
            <div className="flex justify-between">
              <span>Piquete FdS ({totais.piqueteFds} × {fmtEur(totais.taxaPiqueteFds)})</span>
              <span className="font-medium">{fmtEur(totais.totalPiqueteFds)}</span>
            </div>
            <div className="flex justify-between">
              <span>Prev. Passiva Sem. ({totais.prevencaoSemana} × {fmtEur(totais.taxaPrevencaoSemana)})</span>
              <span className="font-medium">{fmtEur(totais.totalPrevencaoSemana)}</span>
            </div>
            <div className="flex justify-between">
              <span>Prev. Passiva FdS ({totais.prevencaoFds} × {fmtEur(totais.taxaPrevencaoFds)})</span>
              <span className="font-medium">{fmtEur(totais.totalPrevencaoFds)}</span>
            </div>
            <div className="border-t pt-1 mt-1 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Aj. Custo Almoço ({totais.ajudaCustoAlmoco} × {fmtEur(totais.taxaAjudaAlmoco)})</span>
                <span>{fmtEur(totais.ajudaCustoAlmoco * totais.taxaAjudaAlmoco)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Aj. Custo Jantar ({totais.ajudaCustoJantar} × {fmtEur(totais.taxaAjudaJantar)})</span>
                <span>{fmtEur(totais.ajudaCustoJantar * totais.taxaAjudaJantar)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Aj. Custo Alojamento ({totais.ajudaCustoAlojamento} × {fmtEur(totais.taxaAjudaAlojamento)})</span>
                <span>{fmtEur(totais.ajudaCustoAlojamento * totais.taxaAjudaAlojamento)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Senha Almoço ({totais.senhaAlmoco} × {fmtEur(totais.taxaSenhaAlmoco)})</span>
                <span>{fmtEur(totais.senhaAlmoco * totais.taxaSenhaAlmoco)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Senha Jantar ({totais.senhaJantar} × {fmtEur(totais.taxaSenhaJantar)})</span>
                <span>{fmtEur(totais.senhaJantar * totais.taxaSenhaJantar)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Senha Ceia ({totais.senhaCeia} × {fmtEur(totais.taxaSenhaCeia)})</span>
                <span>{fmtEur(totais.senhaCeia * totais.taxaSenhaCeia)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Cálculo Final */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Cálculo Final</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Total Bruto</span>
              <span className="font-medium">{fmtEur(totais.totalBruto)}</span>
            </div>
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span>IRS ({(totais.taxaSemanaDia > 0 ? 11.16 : 0)}%)</span>
              <span>-{fmtEur(totais.irs)}</span>
            </div>
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span>Seg. Social (11%)</span>
              <span>-{fmtEur(totais.ss)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-1 mt-1">
              <span>Líquido</span>
              <span>{fmtEur(totais.liquido)}</span>
            </div>

            <div className="border-t pt-2 mt-2 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Limite Mensal (E25/3)</span>
                <span>{fmtEur(totais.limiteMensal)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Utilizado</span>
                <span>{fmtEur(totais.totalContaLimite)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Em Falta</span>
                <span className={totais.emFalta > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}>
                  {fmtEur(totais.emFalta)}
                </span>
              </div>
              {/* Progress bar */}
              <div className="mt-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      totais.percentCompleto >= 1
                        ? 'bg-green-500'
                        : 'bg-blue-500',
                    )}
                    style={{ width: `${Math.min(100, totais.percentCompleto * 100).toFixed(1)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 text-right">
                  {(totais.percentCompleto * 100).toFixed(0)}% do limite mensal
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Linha Form ───────────────────────────────────────────────────────────────

interface LinhaFormProps {
  form: LinhaFormData
  onChange: (f: LinhaFormData) => void
  distanciaMin: number
}

function LinhaForm({ form, onChange, distanciaMin }: LinhaFormProps) {
  const ajudasDisabled = form.km < distanciaMin

  function set<K extends keyof LinhaFormData>(key: K, value: LinhaFormData[K]) {
    onChange({ ...form, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="nuipc">NUIPC</Label>
          <Input
            id="nuipc"
            value={form.nuipc}
            onChange={(e) => set('nuipc', e.target.value)}
            placeholder="Ex: 123/25.1TDLSB"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="local">Local</Label>
          <Input
            id="local"
            value={form.local}
            onChange={(e) => set('local', e.target.value)}
            placeholder="Local da ocorrência"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="dataInicio">Data e Hora Início *</Label>
          <Input
            id="dataInicio"
            type="datetime-local"
            value={form.dataInicio}
            onChange={(e) => set('dataInicio', e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dataFim">Data e Hora Fim *</Label>
          <Input
            id="dataFim"
            type="datetime-local"
            value={form.dataFim}
            onChange={(e) => set('dataFim', e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="prevencao">Tipo de Prevenção</Label>
          <Select
            value={form.prevencao}
            onValueChange={(v) => set('prevencao', v as LinhaFormData['prevencao'])}
          >
            <SelectTrigger id="prevencao">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NENHUMA">Nenhuma</SelectItem>
              <SelectItem value="PIQUETE">Piquete</SelectItem>
              <SelectItem value="PREVENCAO_PASSIVA">Prevenção Passiva</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="viatura">Viatura</Label>
          <Select
            value={form.viatura || 'none'}
            onValueChange={(v) => set('viatura', v === 'none' ? '' : v as LinhaFormData['viatura'])}
          >
            <SelectTrigger id="viatura">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              <SelectItem value="PROPRIA">Viatura Própria</SelectItem>
              <SelectItem value="BRIGADA">Viatura da Brigada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="km">KMs</Label>
        <Input
          id="km"
          type="number"
          min={0}
          value={form.km}
          onChange={(e) => set('km', parseInt(e.target.value, 10) || 0)}
        />
        {form.viatura === 'PROPRIA' && form.km === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            KMs são obrigatórios para viatura própria.
          </p>
        )}
      </div>

      {/* Ajudas de custo section */}
      <div className={cn('space-y-3 p-3 rounded-lg border', ajudasDisabled && 'opacity-50')}>
        <p className="text-sm font-medium">
          Ajudas de Custo
          {ajudasDisabled && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (só aplicáveis com distância &gt; {distanciaMin} km)
            </span>
          )}
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ajudaAlmoco" className="text-xs">Almoço</Label>
            <Input
              id="ajudaAlmoco"
              type="number"
              min={0}
              value={form.ajudaCustoAlmoco}
              onChange={(e) => set('ajudaCustoAlmoco', parseInt(e.target.value, 10) || 0)}
              disabled={ajudasDisabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ajudaJantar" className="text-xs">Jantar</Label>
            <Input
              id="ajudaJantar"
              type="number"
              min={0}
              value={form.ajudaCustoJantar}
              onChange={(e) => set('ajudaCustoJantar', parseInt(e.target.value, 10) || 0)}
              disabled={ajudasDisabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ajudaAlojamento" className="text-xs">Alojamento</Label>
            <Input
              id="ajudaAlojamento"
              type="number"
              min={0}
              value={form.ajudaCustoAlojamento}
              onChange={(e) => set('ajudaCustoAlojamento', parseInt(e.target.value, 10) || 0)}
              disabled={ajudasDisabled}
            />
          </div>
        </div>
      </div>

      {/* Senhas section */}
      <div className="space-y-3 p-3 rounded-lg border">
        <p className="text-sm font-medium">Senhas</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="senhaAlmoco" className="text-xs">Almoço</Label>
            <Input
              id="senhaAlmoco"
              type="number"
              min={0}
              value={form.senhaAlmoco}
              onChange={(e) => set('senhaAlmoco', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senhaJantar" className="text-xs">Jantar</Label>
            <Input
              id="senhaJantar"
              type="number"
              min={0}
              value={form.senhaJantar}
              onChange={(e) => set('senhaJantar', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senhaCeia" className="text-xs">Ceia</Label>
            <Input
              id="senhaCeia"
              type="number"
              min={0}
              value={form.senhaCeia}
              onChange={(e) => set('senhaCeia', parseInt(e.target.value, 10) || 0)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          value={form.observacoes}
          onChange={(e) => set('observacoes', e.target.value)}
          placeholder="Observações opcionais"
          rows={3}
        />
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AjudasMensaisView({
  initialAno,
  initialMes,
  userId,
  initialViewingUserId,
  userRole: _userRole,
  canViewAll: _canViewAll,
  canViewBrigade: _canViewBrigade,
  canManageConfig: _canManageConfig,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [ano, setAno] = useState(initialAno)
  const [mes, setMes] = useState(initialMes)
  // When a chefe/coordenador views another user's record, this holds that user's ID
  const viewingUserId = initialViewingUserId ?? userId
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLinha, setEditingLinha] = useState<AjudasLinha | null>(null)
  const [form, setForm] = useState<LinhaFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteCandidate, setDeleteCandidate] = useState<AjudasLinha | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async (a: number, m: number) => {
    setLoading(true)
    try {
      const uidParam = viewingUserId !== userId ? `&utilizadorId=${viewingUserId}` : ''
      const res = await fetch(`/api/ajudas?ano=${a}&mes=${m}${uidParam}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao carregar dados')
        return
      }
      const d = await res.json()
      setData(d)
    } catch {
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(ano, mes)
  }, [ano, mes, fetchData])

  // Sync URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('ano', String(ano))
    params.set('mes', String(mes))
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [ano, mes, router, searchParams])

  function goToPrevMonth() {
    if (mes === 1) {
      setAno(ano - 1)
      setMes(12)
    } else {
      setMes(mes - 1)
    }
  }

  function goToNextMonth() {
    if (mes === 12) {
      setAno(ano + 1)
      setMes(1)
    } else {
      setMes(mes + 1)
    }
  }

  function openAddDialog() {
    setEditingLinha(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEditDialog(linha: AjudasLinha) {
    setEditingLinha(linha)
    setForm({
      nuipc: linha.nuipc ?? '',
      local: linha.local ?? '',
      dataInicio: toDatetimeLocal(linha.dataInicio),
      dataFim: toDatetimeLocal(linha.dataFim),
      prevencao: linha.prevencao,
      ajudaCustoAlmoco: linha.ajudaCustoAlmoco,
      ajudaCustoJantar: linha.ajudaCustoJantar,
      ajudaCustoAlojamento: linha.ajudaCustoAlojamento,
      senhaAlmoco: linha.senhaAlmoco,
      senhaJantar: linha.senhaJantar,
      senhaCeia: linha.senhaCeia,
      viatura: linha.viatura ?? '',
      km: linha.km,
      observacoes: linha.observacoes ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!data) return
    if (!form.dataInicio || !form.dataFim) {
      toast.error('Datas de início e fim são obrigatórias')
      return
    }
    const dInicio = new Date(form.dataInicio)
    const dFim = new Date(form.dataFim)
    if (isNaN(dInicio.getTime()) || isNaN(dFim.getTime())) {
      toast.error('Data inválida — verifique os campos de data/hora')
      return
    }
    if (dFim <= dInicio) {
      toast.error('A data de fim deve ser posterior à data de início')
      return
    }

    setSaving(true)
    try {
      const payload = {
        nuipc: form.nuipc || null,
        local: form.local || null,
        dataInicio: dInicio.toISOString(),
        dataFim: dFim.toISOString(),
        prevencao: form.prevencao,
        ajudaCustoAlmoco: form.ajudaCustoAlmoco,
        ajudaCustoJantar: form.ajudaCustoJantar,
        ajudaCustoAlojamento: form.ajudaCustoAlojamento,
        senhaAlmoco: form.senhaAlmoco,
        senhaJantar: form.senhaJantar,
        senhaCeia: form.senhaCeia,
        viatura: form.viatura || null,
        km: form.km,
        observacoes: form.observacoes || null,
      }

      let res: Response
      if (editingLinha) {
        res = await fetch(`/api/ajudas/linhas/${editingLinha.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/ajudas/linhas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registoId: data.registo.id, ...payload }),
        })
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }

      const updated = await res.json()
      setData(updated)
      setDialogOpen(false)
      toast.success(editingLinha ? 'Linha atualizada' : 'Linha adicionada')
    } catch {
      toast.error('Erro ao guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteCandidate) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/ajudas/linhas/${deleteCandidate.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao eliminar')
        return
      }
      const updated = await res.json()
      setData(updated)
      setDeleteCandidate(null)
      toast.success('Linha eliminada')
    } catch {
      toast.error('Erro ao eliminar')
    } finally {
      setDeleting(false)
    }
  }

  const distanciaMin = data?.config.distanciaMinKmAjudas ?? 35
  const linhas = data?.registo.linhas ?? []
  const totais = data?.totais

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ajudas Mensais</h1>
          <p className="text-muted-foreground text-sm">
            Registo de horas extra e ajudas de custo mensais
          </p>
        </div>

        {/* Month selector */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPrevMonth}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">
            {MONTH_NAMES[mes - 1]} {ano}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextMonth}
            aria-label="Mês seguinte"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Activity table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Entradas do Mês</CardTitle>
              <Button size="sm" onClick={openAddDialog}>
                <Plus className="h-4 w-4 mr-1.5" />
                Nova entrada
              </Button>
            </CardHeader>
            <CardContent>
              {linhas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Sem entradas para este mês. Clique em «Nova entrada» para adicionar.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-2 px-2 font-medium">NUIPC</th>
                        <th className="text-left py-2 px-2 font-medium">Local</th>
                        <th className="text-left py-2 px-2 font-medium">Início</th>
                        <th className="text-left py-2 px-2 font-medium">Fim</th>
                        <th className="text-left py-2 px-2 font-medium">Duração</th>
                        <th className="text-left py-2 px-2 font-medium">Prevenção</th>
                        <th className="text-left py-2 px-2 font-medium">Viatura/KMs</th>
                        <th className="text-left py-2 px-2 font-medium">Ajudas</th>
                        <th className="text-left py-2 px-2 font-medium">Senhas</th>
                        <th className="text-left py-2 px-2 font-medium">Observações</th>
                        <th className="py-2 px-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l, i) => (
                        <tr
                          key={l.id}
                          className={cn('border-b last:border-0', i % 2 === 0 ? 'bg-transparent' : 'bg-muted/20')}
                        >
                          <td className="py-2 px-2">{l.nuipc || '—'}</td>
                          <td className="py-2 px-2">{l.local || '—'}</td>
                          <td className="py-2 px-2 whitespace-nowrap">{formatDT(l.dataInicio)}</td>
                          <td className="py-2 px-2 whitespace-nowrap">{formatDT(l.dataFim)}</td>
                          <td className="py-2 px-2 whitespace-nowrap">{calcDuration(l.dataInicio, l.dataFim)}</td>
                          <td className="py-2 px-2">
                            {l.prevencao === 'NENHUMA'
                              ? '—'
                              : l.prevencao === 'PIQUETE'
                                ? 'Piquete'
                                : 'Prev. Passiva'}
                          </td>
                          <td className="py-2 px-2">
                            {l.viatura
                              ? `${l.viatura === 'PROPRIA' ? 'Própria' : 'Brigada'} / ${l.km}km`
                              : l.km > 0
                                ? `${l.km}km`
                                : '—'}
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {[
                              l.ajudaCustoAlmoco > 0 && `Al:${l.ajudaCustoAlmoco}`,
                              l.ajudaCustoJantar > 0 && `Jt:${l.ajudaCustoJantar}`,
                              l.ajudaCustoAlojamento > 0 && `Al:${l.ajudaCustoAlojamento}`,
                            ].filter(Boolean).join(' ') || '—'}
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {[
                              l.senhaAlmoco > 0 && `Al:${l.senhaAlmoco}`,
                              l.senhaJantar > 0 && `Jt:${l.senhaJantar}`,
                              l.senhaCeia > 0 && `Ce:${l.senhaCeia}`,
                            ].filter(Boolean).join(' ') || '—'}
                          </td>
                          <td className="py-2 px-2 max-w-[150px] truncate" title={l.observacoes ?? undefined}>
                            {l.observacoes || '—'}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openEditDialog(l)}
                                className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                                aria-label="Editar linha"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteCandidate(l)}
                                className={cn(iconButtonClasses, 'text-red-500 hover:text-red-700')}
                                aria-label="Eliminar linha"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary panel */}
          {totais && <SummaryPanel totais={totais} />}
        </>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingLinha ? 'Editar entrada' : 'Nova entrada'}
            </DialogTitle>
          </DialogHeader>
          <LinhaForm
            form={form}
            onChange={setForm}
            distanciaMin={distanciaMin}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingLinha ? 'Guardar alterações' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteCandidate} onOpenChange={(open) => !open && !deleting && setDeleteCandidate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar entrada</DialogTitle>
          </DialogHeader>
          {deleteCandidate && (
            <div className="space-y-3 text-sm">
              <p>
                Tem a certeza que pretende eliminar a entrada de{' '}
                <strong>{formatDT(deleteCandidate.dataInicio)}</strong> a{' '}
                <strong>{formatDT(deleteCandidate.dataFim)}</strong>?
              </p>
              <p className="text-muted-foreground text-xs">
                Esta ação é irreversível.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteCandidate(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
