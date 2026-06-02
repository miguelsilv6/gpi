'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
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
  FileDown,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Bell,
} from 'lucide-react'
import type { AjudasTotais, ConfigData } from '@/lib/ajudas-calc'
import { getPortugueseHolidays, splitHours, calcLinhaValor } from '@/lib/ajudas-calc'
import { MATRICULA_REGEX } from '@/lib/constants'
import type { Role } from '@/generated/prisma/enums'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ViaturaItem { id: string; nome: string; matricula: string | null }

interface AjudasLinha {
  id: string
  registoId: string
  nuipc: string | null
  local: string | null
  dataInicio: string
  dataFim: string
  prevencao: 'NENHUMA' | 'PIQUETE' | 'PREVENCAO_PASSIVA'
  prevencaoOnly: boolean
  ajudaCustoAlmoco: number
  ajudaCustoJantar: number
  ajudaCustoCeia: number
  senhaAlmoco: number
  senhaJantar: number
  senhaCeia: number
  viaturaId: string | null
  viatura: ViaturaItem | null
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
  totais: AjudasTotais | null
  userConfigured: boolean
}

interface LinhaFormData {
  nuipc: string
  local: string
  dataInicio: string
  dataFim: string
  ajudaCustoAlmoco: number
  ajudaCustoJantar: number
  ajudaCustoCeia: number
  viaturaId: string
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
  userName?: string
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
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
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
  // Timestamps are stored as wall-clock UTC — read back with UTC accessors.
  const d = new Date(dt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

const EMPTY_FORM: LinhaFormData = {
  nuipc: '',
  local: '',
  dataInicio: '',
  dataFim: '',
  ajudaCustoAlmoco: 0,
  ajudaCustoJantar: 0,
  ajudaCustoCeia: 0,
  viaturaId: '',
  km: 0,
  observacoes: '',
}

// ─── Summary Panel ────────────────────────────────────────────────────────────

function SummaryPanel({ totais }: { totais: AjudasTotais }) {
  const uncappedSemana = totais.totalSemanaDia + totais.totalSemanaNoite
  const uncappedFds = totais.totalFdsDia + totais.totalFdsNoite
  const capApplied =
    totais.totalHorasExtraSemana < uncappedSemana - 0.001 ||
    totais.totalHorasExtraFds < uncappedFds - 0.001

  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
      <h3 className="font-semibold text-base">Resumo do Mês</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: Horas Extra */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Horas Extra</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Semana 08-24h ({totais.semanaDia.toFixed(2)}h × {fmtEur(totais.taxaSemanaDia)})</span>
              <span className="font-medium">{fmtEur(totais.totalSemanaDia)}</span>
            </div>
            <div className="flex justify-between">
              <span>Semana 00-08h ({totais.semanaNoite.toFixed(2)}h × {fmtEur(totais.taxaSemanaNoite)})</span>
              <span className="font-medium">{fmtEur(totais.totalSemanaNoite)}</span>
            </div>
            <div className="flex justify-between">
              <span>FdS/Feriado 08-24h ({totais.fdsDia.toFixed(2)}h × {fmtEur(totais.taxaFdsDia)})</span>
              <span className="font-medium">{fmtEur(totais.totalFdsDia)}</span>
            </div>
            <div className="flex justify-between">
              <span>FdS/Feriado 00-08h ({totais.fdsNoite.toFixed(2)}h × {fmtEur(totais.taxaFdsNoite)})</span>
              <span className="font-medium">{fmtEur(totais.totalFdsNoite)}</span>
            </div>
            {capApplied && (
              <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-2 py-1 mt-1 space-y-0.5">
                <p className="font-medium">Limite diário (piquete) aplicado:</p>
                {totais.totalHorasExtraSemana < uncappedSemana - 0.001 && (
                  <div className="flex justify-between">
                    <span>Semana</span>
                    <span>{fmtEur(totais.totalHorasExtraSemana)} <span className="line-through opacity-60">{fmtEur(uncappedSemana)}</span></span>
                  </div>
                )}
                {totais.totalHorasExtraFds < uncappedFds - 0.001 && (
                  <div className="flex justify-between">
                    <span>FdS/Feriado</span>
                    <span>{fmtEur(totais.totalHorasExtraFds)} <span className="line-through opacity-60">{fmtEur(uncappedFds)}</span></span>
                  </div>
                )}
              </div>
            )}
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
                <span>Aj. Custo Ceia ({totais.ajudaCustoCeia} × {fmtEur(totais.taxaAjudaCeia)})</span>
                <span>{fmtEur(totais.ajudaCustoCeia * totais.taxaAjudaCeia)}</span>
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
              <span>IRS ({(totais.taxaIRS * 100).toFixed(2)}%)</span>
              <span>-{fmtEur(totais.irs)}</span>
            </div>
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span>Seg. Social ({(totais.taxaSS * 100).toFixed(0)}%)</span>
              <span>-{fmtEur(totais.ss)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-1 mt-1">
              <span>Líquido</span>
              <span>{fmtEur(totais.liquido)}</span>
            </div>

            <div className="border-t pt-2 mt-2 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Limite Mensal (vencimento / 3)</span>
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
              {/* Progress bar — turns red when over the monthly limit */}
              <div className="mt-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      totais.percentCompleto > 1
                        ? 'bg-red-500'
                        : totais.percentCompleto >= 0.999
                          ? 'bg-green-500'
                          : 'bg-blue-500',
                    )}
                    style={{ width: `${Math.min(100, totais.percentCompleto * 100).toFixed(1)}%` }}
                  />
                </div>
                <p className={cn(
                  'text-xs mt-0.5 text-right',
                  totais.percentCompleto > 1
                    ? 'text-red-600 dark:text-red-400 font-semibold'
                    : 'text-muted-foreground',
                )}>
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

function getDayType(datetimeLocalStr: string): 'feriado' | 'fds' | 'semana' | null {
  if (!datetimeLocalStr) return null
  const dateStr = datetimeLocalStr.slice(0, 10)
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  const [year, month, day] = parts as [number, number, number]
  const d = new Date(Date.UTC(year, month - 1, day))
  const holidays = getPortugueseHolidays(year)
  if (holidays.has(dateStr)) return 'feriado'
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) return 'fds'
  return 'semana'
}

interface LinhaFormProps {
  form: LinhaFormData
  onChange: (f: LinhaFormData) => void
  distanciaMin: number
  viaturas: ViaturaItem[]
  onViaturaAdded: (v: ViaturaItem) => void
}

function LinhaForm({ form, onChange, distanciaMin, viaturas, onViaturaAdded }: LinhaFormProps) {
  const ajudasDisabled = form.km < distanciaMin

  const [addViaturaOpen, setAddViaturaOpen] = useState(false)
  const [addViaturaForm, setAddViaturaForm] = useState({ nome: '', matricula: '' })
  const [addViaturaError, setAddViaturaError] = useState('')
  const [addViaturaLoading, setAddViaturaLoading] = useState(false)

  async function handleAddViatura() {
    if (!addViaturaForm.nome.trim()) { setAddViaturaError('Nome obrigatório'); return }
    if (addViaturaForm.matricula && !MATRICULA_REGEX.test(addViaturaForm.matricula)) {
      setAddViaturaError('Formato inválido — use XX-XX-XX (ex: AB-12-CD)')
      return
    }
    setAddViaturaLoading(true)
    setAddViaturaError('')
    try {
      const res = await fetch('/api/viaturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: addViaturaForm.nome.trim(), matricula: addViaturaForm.matricula.toUpperCase() || null }),
      })
      const json = await res.json()
      if (!res.ok) { setAddViaturaError(json.error ?? 'Erro ao criar viatura'); return }
      onViaturaAdded(json)
      onChange({ ...form, viaturaId: json.id })
      setAddViaturaOpen(false)
      setAddViaturaForm({ nome: '', matricula: '' })
    } catch {
      setAddViaturaError('Erro ao criar viatura')
    } finally {
      setAddViaturaLoading(false)
    }
  }

  function set<K extends keyof LinhaFormData>(key: K, value: LinhaFormData[K]) {
    onChange({ ...form, [key]: value })
  }

  const selectedViatura = viaturas.find(v => v.id === form.viaturaId)

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
          {form.dataInicio && (() => {
            const type = getDayType(form.dataInicio)
            if (!type) return null
            const cfg = {
              feriado: { label: 'Feriado', cls: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800' },
              fds: { label: 'Fim-de-Semana', cls: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800' },
              semana: { label: 'Dia de Semana', cls: 'text-muted-foreground bg-muted/40 border-border' },
            }[type]
            return (
              <span className={`text-xs px-2 py-0.5 rounded border inline-block ${cfg.cls}`}>
                {cfg.label}
              </span>
            )
          })()}
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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="viaturaId">Viatura</Label>
          <button
            type="button"
            onClick={() => { setAddViaturaOpen(true); setAddViaturaError(''); setAddViaturaForm({ nome: '', matricula: '' }) }}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Adicionar viatura
          </button>
        </div>
        <Select
          value={form.viaturaId || 'none'}
          onValueChange={(v) => set('viaturaId', v == null || v === 'none' ? '' : v)}
        >
          <SelectTrigger id="viaturaId">
            <span className="truncate text-sm">
              {selectedViatura
                ? `${selectedViatura.nome}${selectedViatura.matricula ? ` (${selectedViatura.matricula})` : ''}`
                : <span className="text-muted-foreground">Nenhuma</span>}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhuma</SelectItem>
            {viaturas.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.nome}{v.matricula ? ` (${v.matricula})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Add viatura mini-dialog */}
      <Dialog open={addViaturaOpen} onOpenChange={(o) => !addViaturaLoading && setAddViaturaOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adicionar Viatura</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="av-nome">Nome</Label>
              <Input
                id="av-nome"
                value={addViaturaForm.nome}
                onChange={(e) => setAddViaturaForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Carro de serviço"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="av-matricula">Matrícula</Label>
              <Input
                id="av-matricula"
                value={addViaturaForm.matricula}
                onChange={(e) => setAddViaturaForm(f => ({ ...f, matricula: e.target.value.toUpperCase() }))}
                placeholder="XX-XX-XX"
                maxLength={8}
              />
              <p className="text-xs text-muted-foreground">Formato: XX-XX-XX (ex: AB-12-CD)</p>
            </div>
            {addViaturaError && <p className="text-xs text-red-600 dark:text-red-400">{addViaturaError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddViaturaOpen(false)} disabled={addViaturaLoading}>Cancelar</Button>
            <Button onClick={handleAddViatura} disabled={addViaturaLoading}>
              {addViaturaLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-1.5">
        <Label htmlFor="km">Distância (km)</Label>
        <Input
          id="km"
          type="number"
          min={0}
          value={form.km}
          onChange={(e) => set('km', parseInt(e.target.value, 10) || 0)}
        />
        {form.viaturaId && form.km === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Recomendado indicar a distância quando é utilizada uma viatura.
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
            <Label htmlFor="ajudaCeia" className="text-xs">Ceia</Label>
            <Input
              id="ajudaCeia"
              type="number"
              min={0}
              value={form.ajudaCustoCeia}
              onChange={(e) => set('ajudaCustoCeia', parseInt(e.target.value, 10) || 0)}
              disabled={ajudasDisabled}
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

function escHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function AjudasMensaisView({
  initialAno,
  initialMes,
  userId,
  initialViewingUserId,
  userRole: _userRole,
  canViewAll: _canViewAll,
  canViewBrigade: _canViewBrigade,
  canManageConfig: _canManageConfig,
  userName,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [ano, setAno] = useState(initialAno)
  const [mes, setMes] = useState(initialMes)
  const fetchSeqRef = useRef(0)
  // When a chefe/coordenador views another user's record, this holds that user's ID
  const viewingUserId = initialViewingUserId ?? userId
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [viaturas, setViaturas] = useState<ViaturaItem[]>([])

  useEffect(() => {
    fetch('/api/viaturas')
      .then((r) => r.json())
      .then(setViaturas)
      .catch(() => {})
  }, [])

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLinha, setEditingLinha] = useState<AjudasLinha | null>(null)
  const [entryType, setEntryType] = useState<'horas-extra' | 'piquete' | 'prevencao'>('horas-extra')
  const [form, setForm] = useState<LinhaFormData>(EMPTY_FORM)
  const [piqueteDate, setPiqueteDate] = useState('')
  const [prevencaoInicio, setPrevencaoInicio] = useState('')
  const [prevencaoFim, setPrevencaoFim] = useState('')
  const [editingLinhaPrevencao, setEditingLinhaPrevencao] = useState<'NENHUMA' | 'PIQUETE' | 'PREVENCAO_PASSIVA'>('NENHUMA')
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteCandidate, setDeleteCandidate] = useState<AjudasLinha | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async (a: number, m: number) => {
    const seq = ++fetchSeqRef.current
    setLoading(true)
    try {
      const uidParam = viewingUserId !== userId ? `&utilizadorId=${viewingUserId}` : ''
      const res = await fetch(`/api/ajudas?ano=${a}&mes=${m}${uidParam}`)
      if (fetchSeqRef.current !== seq) return
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao carregar dados')
        return
      }
      const d = await res.json()
      if (fetchSeqRef.current !== seq) return
      setData(d)
    } catch {
      if (fetchSeqRef.current === seq) toast.error('Erro ao carregar dados')
    } finally {
      if (fetchSeqRef.current === seq) setLoading(false)
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
    setEntryType('horas-extra')
    setForm(EMPTY_FORM)
    setPiqueteDate('')
    setPrevencaoInicio('')
    setPrevencaoFim('')
    setDialogOpen(true)
  }

  function openEditDialog(linha: AjudasLinha) {
    setEditingLinha(linha)
    setEntryType('horas-extra')
    setEditingLinhaPrevencao(linha.prevencao)
    setForm({
      nuipc: linha.nuipc ?? '',
      local: linha.local ?? '',
      dataInicio: toDatetimeLocal(linha.dataInicio),
      dataFim: toDatetimeLocal(linha.dataFim),
      ajudaCustoAlmoco: linha.ajudaCustoAlmoco,
      ajudaCustoJantar: linha.ajudaCustoJantar,
      ajudaCustoCeia: linha.ajudaCustoCeia,
      viaturaId: linha.viaturaId ?? '',
      km: linha.km,
      observacoes: linha.observacoes ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!data) return
    setSaving(true)
    try {
      let res: Response

      if (entryType === 'piquete' && !editingLinha) {
        // Piquete — single day
        if (!piqueteDate) { toast.error('Selecione um dia'); return }
        const parts = piqueteDate.split('-').map(Number)
        if (parts.length !== 3 || parts.some(isNaN)) { toast.error('Data inválida'); return }
        const [year, month, day] = parts as [number, number, number]
        const inicio = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
        const fim = new Date(Date.UTC(year, month - 1, day, 23, 59, 0, 0))
        res = await fetch('/api/ajudas/linhas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registoId: data.registo.id,
            dataInicio: inicio.toISOString(),
            dataFim: fim.toISOString(),
            prevencao: 'PIQUETE',
            prevencaoOnly: true,
          }),
        })
      } else if (entryType === 'prevencao' && !editingLinha) {
        // Prevenção Passiva — date range
        if (!prevencaoInicio || !prevencaoFim) { toast.error('Selecione as datas de início e fim'); return }
        const pi = prevencaoInicio.split('-').map(Number)
        const pf = prevencaoFim.split('-').map(Number)
        if (pi.length !== 3 || pi.some(isNaN) || pf.length !== 3 || pf.some(isNaN)) { toast.error('Datas inválidas'); return }
        const [yi, mi, di] = pi as [number, number, number]
        const [yf, mf, df] = pf as [number, number, number]
        const dInicio = new Date(Date.UTC(yi, mi - 1, di, 0, 0, 0, 0))
        const dFim = new Date(Date.UTC(yf, mf - 1, df, 23, 59, 0, 0))
        if (dFim < dInicio) { toast.error('A data de fim deve ser igual ou posterior à data de início'); return }
        const diffDays = Math.ceil((dFim.getTime() - dInicio.getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays > 31) { toast.error('O intervalo de prevenção não pode ser superior a 31 dias'); return }
        res = await fetch('/api/ajudas/linhas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registoId: data.registo.id,
            dataInicio: dInicio.toISOString(),
            dataFim: dFim.toISOString(),
            prevencao: 'PREVENCAO_PASSIVA',
            prevencaoOnly: true,
          }),
        })
      } else {
        // Standard horas extra entry
        if (!form.dataInicio || !form.dataFim) {
          toast.error('Datas de início e fim são obrigatórias')
          return
        }
        // Treat datetime-local values as wall-clock UTC (append Z to avoid local timezone shift).
        const dInicio = new Date(form.dataInicio.slice(0, 16) + ':00.000Z')
        const dFim = new Date(form.dataFim.slice(0, 16) + ':00.000Z')
        if (isNaN(dInicio.getTime()) || isNaN(dFim.getTime())) {
          toast.error('Data inválida — verifique os campos de data/hora')
          return
        }
        if (dFim <= dInicio) {
          toast.error('A data de fim deve ser posterior à data de início')
          return
        }

        const payload = {
          nuipc: form.nuipc || null,
          local: form.local || null,
          dataInicio: dInicio.toISOString(),
          dataFim: dFim.toISOString(),
          prevencao: (editingLinha ? editingLinhaPrevencao : 'NENHUMA') as 'NENHUMA' | 'PIQUETE' | 'PREVENCAO_PASSIVA',
          ajudaCustoAlmoco: form.ajudaCustoAlmoco,
          ajudaCustoJantar: form.ajudaCustoJantar,
          ajudaCustoCeia: form.ajudaCustoCeia,
          viaturaId: form.viaturaId || null,
          km: form.km,
          observacoes: form.observacoes || null,
        }

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

  function calcPiquetePreview(dateStr: string, totaisData: AjudasTotais): string {
    if (!dateStr) return '—'
    const parts = dateStr.split('-').map(Number)
    if (parts.length !== 3 || parts.some(isNaN)) return '—'
    const [year, month, day] = parts as [number, number, number]
    const d = new Date(Date.UTC(year, month - 1, day))
    const holidays = getPortugueseHolidays(year)
    const isFds = d.getUTCDay() === 0 || d.getUTCDay() === 6 || holidays.has(dateStr)
    const val = isFds ? totaisData.taxaPiqueteFds : totaisData.taxaPiqueteSemana
    return `€${val.toFixed(2)} (${isFds ? 'FdS/Feriado' : 'Semana'})`
  }

  function calcPrevencaoPreview(inicioStr: string, fimStr: string, totaisData: AjudasTotais): { semana: number; fds: number; total: number; valor: number } | null {
    if (!inicioStr || !fimStr) return null
    const pi = inicioStr.split('-').map(Number)
    const pf = fimStr.split('-').map(Number)
    if (pi.length !== 3 || pi.some(isNaN) || pf.length !== 3 || pf.some(isNaN)) return null
    const [yi, mi, di] = pi as [number, number, number]
    const [yf, mf, df] = pf as [number, number, number]
    const cur = new Date(Date.UTC(yi, mi - 1, di))
    const last = new Date(Date.UTC(yf, mf - 1, df))
    if (last < cur) return null
    const pad = (n: number) => String(n).padStart(2, '0')
    const holidaysCache = new Map<number, Set<string>>()
    let semana = 0, fds = 0, daysCount = 0
    while (cur.getTime() <= last.getTime() && daysCount < 90) {
      const y = cur.getUTCFullYear()
      if (!holidaysCache.has(y)) holidaysCache.set(y, getPortugueseHolidays(y))
      const hols = holidaysCache.get(y)!
      const dateKey = `${y}-${pad(cur.getUTCMonth() + 1)}-${pad(cur.getUTCDate())}`
      const dow = cur.getUTCDay()
      if (dow === 0 || dow === 6 || hols.has(dateKey)) fds += 1
      else semana += 1
      cur.setUTCDate(cur.getUTCDate() + 1)
      daysCount++
    }
    const valor = semana * totaisData.taxaPrevencaoSemana + fds * totaisData.taxaPrevencaoFds
    return { semana, fds, total: semana + fds, valor }
  }

  const holidaySet = useMemo(() => {
    const s = new Set<string>()
    for (const y of [ano - 1, ano, ano + 1]) {
      for (const h of getPortugueseHolidays(y)) s.add(h)
    }
    return s
  }, [ano])

  function calcPaidHours(inicio: string, fim: string): string {
    const { semanaDia, semanaNoite, fdsDia, fdsNoite } = splitHours(new Date(inicio), new Date(fim), holidaySet)
    const total = semanaDia + semanaNoite + fdsDia + fdsNoite
    if (total <= 0) return '—'
    const h = Math.floor(total)
    const m = Math.round((total - h) * 60)
    if (m === 0) return `${h}h`
    return `${h}h${String(m).padStart(2, '0')}m`
  }

  function handleExportPDF() {
    if (!data?.totais) return
    const { registo, config, totais } = data
    const vencimentoBase = totais.limiteBase

    const win = window.open('', '_blank', 'width=900,height=900')
    if (!win) return

    const monthName = MONTH_NAMES[mes - 1]
    const title = `Ajudas Mensais — ${monthName} ${ano}`
    const today = new Date()
    const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`

    const tableRows = registo.linhas.map((l) => {
      const valor = calcLinhaValor(
        {
          dataInicio: new Date(l.dataInicio),
          dataFim: new Date(l.dataFim),
          prevencao: l.prevencao,
          prevencaoOnly: l.prevencaoOnly,
          ajudaCustoAlmoco: l.ajudaCustoAlmoco,
          ajudaCustoJantar: l.ajudaCustoJantar,
          ajudaCustoCeia: l.ajudaCustoCeia,
          senhaAlmoco: l.senhaAlmoco,
          senhaJantar: l.senhaJantar,
          senhaCeia: l.senhaCeia,
          km: l.km,
        },
        config,
        vencimentoBase,
        ano,
        mes,
      )
      const prevLabel = l.prevencao === 'PIQUETE' ? 'Piquete' : l.prevencao === 'PREVENCAO_PASSIVA' ? 'Prev. Passiva' : '—'
      const viaturaStr = l.viatura
        ? `${escHtml(l.viatura.nome)}${l.viatura.matricula ? ` (${escHtml(l.viatura.matricula)})` : ''} / ${l.km}km`
        : l.km > 0 ? `${l.km}km` : '—'
      const ajudasStr = [
        l.ajudaCustoAlmoco > 0 && `Al:${l.ajudaCustoAlmoco}`,
        l.ajudaCustoJantar > 0 && `Jt:${l.ajudaCustoJantar}`,
        l.ajudaCustoCeia > 0 && `Ceia:${l.ajudaCustoCeia}`,
      ].filter(Boolean).join(' ') || '—'
      return `<tr>
        <td>${escHtml(l.nuipc) || '—'}</td>
        <td>${escHtml(l.local) || '—'}</td>
        <td class="nw">${escHtml(formatDT(l.dataInicio))}</td>
        <td class="nw">${escHtml(formatDT(l.dataFim))}</td>
        <td>${prevLabel}</td>
        <td>${viaturaStr}</td>
        <td>${ajudasStr}</td>
        <td class="r b">${fmtEur(valor)}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<title>${escHtml(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10pt;color:#111;padding:16mm}
h1{font-size:14pt;margin-bottom:3px}
.sub{font-size:9pt;color:#666;margin-bottom:12px}
.sec{font-size:10pt;font-weight:bold;margin:12px 0 6px;border-bottom:1px solid #bbb;padding-bottom:2px}
table{width:100%;border-collapse:collapse;font-size:8.5pt}
th{background:#e5e5e5;border:1px solid #bbb;padding:3px 5px;text-align:left;font-weight:bold}
td{border:1px solid #ddd;padding:3px 5px;vertical-align:top}
tr:nth-child(even) td{background:#f6f6f6}
.r{text-align:right}.b{font-weight:bold}.nw{white-space:nowrap}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px}
.block{border:1px solid #ccc;padding:7px;border-radius:3px}
.block h3{font-size:8.5pt;font-weight:bold;color:#444;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #eee;padding-bottom:2px;margin-bottom:5px}
.row{display:flex;justify-content:space-between;font-size:8pt;margin-bottom:2px}
.row.sep{border-top:1px solid #ddd;margin-top:3px;padding-top:3px}
.row.tot{font-weight:bold;font-size:9.5pt}
.footer{margin-top:12px;font-size:7.5pt;color:#aaa}
@media print{body{padding:8mm}@page{margin:8mm}}
</style>
</head>
<body>
<h1>${escHtml(title)}</h1>
<p class="sub">${userName ? `Utilizador: ${escHtml(userName)} &bull; ` : ''}Gerado em ${todayStr}</p>
<div class="sec">Entradas do Mês</div>
<table>
<thead><tr>
  <th>NUIPC</th><th>Local</th><th>Início</th><th>Fim</th>
  <th>Prevenção</th><th>Viatura / KMs</th><th>Ajudas</th><th class="r">Valor bruto</th>
</tr></thead>
<tbody>${tableRows}</tbody>
</table>
<div class="sec">Resumo do Mês</div>
<div class="grid">
  <div class="block">
    <h3>Horas Extra</h3>
    <div class="row"><span>Semana 08-24h (${totais.semanaDia.toFixed(2)}h × ${fmtEur(totais.taxaSemanaDia)})</span><span>${fmtEur(totais.totalSemanaDia)}</span></div>
    <div class="row"><span>Semana 00-08h (${totais.semanaNoite.toFixed(2)}h × ${fmtEur(totais.taxaSemanaNoite)})</span><span>${fmtEur(totais.totalSemanaNoite)}</span></div>
    <div class="row"><span>FdS 08-24h (${totais.fdsDia.toFixed(2)}h × ${fmtEur(totais.taxaFdsDia)})</span><span>${fmtEur(totais.totalFdsDia)}</span></div>
    <div class="row"><span>FdS 00-08h (${totais.fdsNoite.toFixed(2)}h × ${fmtEur(totais.taxaFdsNoite)})</span><span>${fmtEur(totais.totalFdsNoite)}</span></div>
    <div class="row sep tot"><span>Subtotal H. Extra</span><span>${fmtEur(totais.totalHorasExtra)}</span></div>
  </div>
  <div class="block">
    <h3>Prevenção / Ajudas</h3>
    <div class="row"><span>Piquete Sem. (${totais.piqueteSemana} × ${fmtEur(totais.taxaPiqueteSemana)})</span><span>${fmtEur(totais.totalPiqueteSemana)}</span></div>
    <div class="row"><span>Piquete FdS (${totais.piqueteFds} × ${fmtEur(totais.taxaPiqueteFds)})</span><span>${fmtEur(totais.totalPiqueteFds)}</span></div>
    <div class="row"><span>Prev. Passiva Sem. (${totais.prevencaoSemana} × ${fmtEur(totais.taxaPrevencaoSemana)})</span><span>${fmtEur(totais.totalPrevencaoSemana)}</span></div>
    <div class="row"><span>Prev. Passiva FdS (${totais.prevencaoFds} × ${fmtEur(totais.taxaPrevencaoFds)})</span><span>${fmtEur(totais.totalPrevencaoFds)}</span></div>
    <div class="row sep"><span>Aj. Custo Almoço (${totais.ajudaCustoAlmoco} × ${fmtEur(totais.taxaAjudaAlmoco)})</span><span>${fmtEur(totais.ajudaCustoAlmoco * totais.taxaAjudaAlmoco)}</span></div>
    <div class="row"><span>Aj. Custo Jantar (${totais.ajudaCustoJantar} × ${fmtEur(totais.taxaAjudaJantar)})</span><span>${fmtEur(totais.ajudaCustoJantar * totais.taxaAjudaJantar)}</span></div>
    <div class="row"><span>Aj. Custo Ceia (${totais.ajudaCustoCeia} × ${fmtEur(totais.taxaAjudaCeia)})</span><span>${fmtEur(totais.ajudaCustoCeia * totais.taxaAjudaCeia)}</span></div>
  </div>
  <div class="block">
    <h3>Cálculo Final</h3>
    <div class="row"><span>Total Bruto</span><span>${fmtEur(totais.totalBruto)}</span></div>
    <div class="row"><span>IRS (${(totais.taxaIRS * 100).toFixed(2)}%)</span><span>-${fmtEur(totais.irs)}</span></div>
    <div class="row"><span>Seg. Social (${(totais.taxaSS * 100).toFixed(0)}%)</span><span>-${fmtEur(totais.ss)}</span></div>
    <div class="row sep tot"><span>Líquido</span><span>${fmtEur(totais.liquido)}</span></div>
    <div class="row sep"><span>Limite Mensal (venc./3)</span><span>${fmtEur(totais.limiteMensal)}</span></div>
    <div class="row"><span>Utilizado</span><span>${fmtEur(totais.totalContaLimite)}</span></div>
    <div class="row"><span>Em Falta</span><span>${fmtEur(totais.emFalta)}</span></div>
  </div>
</div>
<p class="footer">Ajudas Mensais &bull; ${todayStr}</p>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`

    win.document.write(html)
    win.document.close()
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
          {/* Not-configured banner */}
          {data && !data.userConfigured && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              Para utilizar este módulo, configure o seu <strong>Vencimento Base</strong> e a <strong>Taxa de Retenção de IRS</strong> na página de{' '}
              <a href="/perfil" className="underline font-medium">Perfil → Ajudas Mensais</a>.
            </div>
          )}

          {/* Activity table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Entradas do Mês</CardTitle>
              <div className="flex items-center gap-2">
                {linhas.length > 0 && data?.totais && (
                  <Button size="sm" variant="outline" onClick={handleExportPDF}>
                    <FileDown className="h-4 w-4 mr-1.5" />
                    Exportar PDF
                  </Button>
                )}
                {data?.userConfigured && (
                  <Button size="sm" onClick={openAddDialog}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Nova entrada
                  </Button>
                )}
              </div>
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
                        <th className="text-right py-2 px-2 font-medium">Valor</th>
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
                          <td className="py-2 px-2 whitespace-nowrap">
                            {l.prevencaoOnly
                              ? <span className="text-muted-foreground text-xs italic">só prevenção</span>
                              : calcPaidHours(l.dataInicio, l.dataFim)}
                          </td>
                          <td className="py-2 px-2">
                            {l.prevencao === 'NENHUMA'
                              ? '—'
                              : l.prevencao === 'PIQUETE'
                                ? 'Piquete'
                                : 'Prev. Passiva'}
                          </td>
                          <td className="py-2 px-2">
                            {l.viatura
                              ? `${l.viatura.nome}${l.viatura.matricula ? ` (${l.viatura.matricula})` : ''} / ${l.km}km`
                              : l.km > 0
                                ? `${l.km}km`
                                : '—'}
                          </td>
                          <td className="py-2 px-2 text-xs">
                            {[
                              l.ajudaCustoAlmoco > 0 && `Al:${l.ajudaCustoAlmoco}`,
                              l.ajudaCustoJantar > 0 && `Jt:${l.ajudaCustoJantar}`,
                              l.ajudaCustoCeia > 0 && `Ceia:${l.ajudaCustoCeia}`,
                            ].filter(Boolean).join(' ') || '—'}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap text-sm font-medium">
                            {data?.totais
                              ? fmtEur(calcLinhaValor(
                                  {
                                    dataInicio: new Date(l.dataInicio),
                                    dataFim: new Date(l.dataFim),
                                    prevencao: l.prevencao,
                                    prevencaoOnly: l.prevencaoOnly,
                                    ajudaCustoAlmoco: l.ajudaCustoAlmoco,
                                    ajudaCustoJantar: l.ajudaCustoJantar,
                                    ajudaCustoCeia: l.ajudaCustoCeia,
                                    senhaAlmoco: l.senhaAlmoco,
                                    senhaJantar: l.senhaJantar,
                                    senhaCeia: l.senhaCeia,
                                    km: l.km,
                                  },
                                  data.config,
                                  data.totais.limiteBase,
                                  ano,
                                  mes,
                                ))
                              : '—'}
                          </td>
                          <td className="py-2 px-2 max-w-[150px] truncate" title={l.observacoes ?? undefined}>
                            {l.observacoes || '—'}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1">
                              {!l.prevencaoOnly && (
                                <button
                                  onClick={() => openEditDialog(l)}
                                  className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                                  aria-label="Editar linha"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
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

          {/* Entry type toggle — only for new entries */}
          {!editingLinha && (
            <div className="flex rounded-lg border overflow-hidden text-sm">
              {(['horas-extra', 'piquete', 'prevencao'] as const).map((t) => {
                const labels = { 'horas-extra': 'Horas Extra', piquete: 'Piquete', prevencao: 'Prevenção' }
                return (
                  <button
                    key={t}
                    type="button"
                    className={cn(
                      'flex-1 px-3 py-2 font-medium transition-colors',
                      entryType === t
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted',
                    )}
                    onClick={() => setEntryType(t)}
                  >
                    {labels[t]}
                  </button>
                )
              })}
            </div>
          )}

          {entryType === 'piquete' && !editingLinha ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="piqueteDate">Dia *</Label>
                <Input
                  id="piqueteDate"
                  type="date"
                  value={piqueteDate}
                  onChange={(e) => setPiqueteDate(e.target.value)}
                />
                {piqueteDate && (() => {
                  const type = getDayType(piqueteDate + 'T00:00')
                  if (!type) return null
                  const cfg = {
                    feriado: { label: 'Feriado', cls: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800' },
                    fds: { label: 'Fim-de-Semana', cls: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800' },
                    semana: { label: 'Dia de Semana', cls: 'text-muted-foreground bg-muted/40 border-border' },
                  }[type]
                  return <span className={`text-xs px-2 py-0.5 rounded border inline-block ${cfg.cls}`}>{cfg.label}</span>
                })()}
              </div>
              {piqueteDate && data?.totais && (
                <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Valor calculado: </span>
                  <span className="font-semibold">{calcPiquetePreview(piqueteDate, data.totais)}</span>
                </div>
              )}
            </div>
          ) : entryType === 'prevencao' && !editingLinha ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="prevInicio">Data de Início *</Label>
                  <Input
                    id="prevInicio"
                    type="date"
                    value={prevencaoInicio}
                    onChange={(e) => setPrevencaoInicio(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prevFim">Data de Fim *</Label>
                  <Input
                    id="prevFim"
                    type="date"
                    value={prevencaoFim}
                    onChange={(e) => setPrevencaoFim(e.target.value)}
                  />
                </div>
              </div>
              {prevencaoInicio && prevencaoFim && data?.totais && (() => {
                const prev = calcPrevencaoPreview(prevencaoInicio, prevencaoFim, data.totais)
                if (!prev) return null
                return (
                  <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total de dias</span>
                      <span className="font-medium">{prev.total}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Dias de semana × €{data.totais.taxaPrevencaoSemana.toFixed(2)}</span>
                      <span>{prev.semana}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>FdS/Feriados × €{data.totais.taxaPrevencaoFds.toFixed(2)}</span>
                      <span>{prev.fds}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                      <span>Valor estimado</span>
                      <span>€{prev.valor.toFixed(2)}</span>
                    </div>
                  </div>
                )
              })()}
            </div>
          ) : (
            <LinhaForm
              form={form}
              onChange={setForm}
              distanciaMin={distanciaMin}
              viaturas={viaturas}
              onViaturaAdded={(v) => setViaturas(prev => [...prev, v])}
            />
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                (entryType === 'piquete' && !editingLinha && !piqueteDate) ||
                (entryType === 'prevencao' && !editingLinha && (!prevencaoInicio || !prevencaoFim))
              }
            >
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
