'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  EstadoBarChart,
  NaturezaBarChart,
  AnoBarChart,
} from './charts'
import { FileText, MonitorCog, Send, Archive, CheckCircle2, X, Mail, CalendarDays } from 'lucide-react'

interface Stats {
  total: number
  vencidos: number
  cartasPrecatorias: number
  aguardaExames: number
  enviados: number
  arquivados: number
  concluidos: number
  porEstado: { estadoId: string; codigo: string; nome: string; cor: string | null; count: number }[]
  porNatureza: { natureza: string; count: number }[]
  porAno: { ano: string; count: number }[]
  atividadesInspetor: {
    descricao: string
    count: number
    sumQuantidade: number
    temQuantidade: boolean
  }[]
  atividadesInspetorTotal: number
}

type Preset = 'custom' | 'this_month' | 'last_month' | 'this_year' | 'last_30'

const PRESET_LABELS: Record<Preset, string> = {
  custom: 'Período personalizado',
  this_month: 'Este mês',
  last_month: 'Mês passado',
  last_30: 'Últimos 30 dias',
  this_year: 'Este ano',
}

function rangeForPreset(preset: Preset): [string, string] {
  const now = new Date()
  if (preset === 'this_month') {
    return [
      fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
      fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    ]
  }
  if (preset === 'last_month') {
    return [
      fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      fmt(new Date(now.getFullYear(), now.getMonth(), 0)),
    ]
  }
  if (preset === 'last_30') {
    const from = new Date(now)
    from.setDate(from.getDate() - 29)
    return [fmt(from), fmt(now)]
  }
  if (preset === 'this_year') {
    return [
      fmt(new Date(now.getFullYear(), 0, 1)),
      fmt(new Date(now.getFullYear(), 11, 31)),
    ]
  }
  return ['', '']
}

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── Férias Gantt ─────────────────────────────────────────────────────────────

const MONTHS_PT_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const

interface FeriasPeriod {
  dataInicio: string
  dataFim: string
  nota: string | null
}

function parseDMY(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

function FeriasYearBar({ ferias, ano }: { ferias: FeriasPeriod[]; ano: number }) {
  const startOfYear = new Date(ano, 0, 1)
  const endOfYear = new Date(ano, 11, 31)
  const totalDays = Math.round((endOfYear.getTime() - startOfYear.getTime()) / 86400000) + 1

  const months = Array.from({ length: 12 }, (_, i) => {
    const offset = Math.round((new Date(ano, i, 1).getTime() - startOfYear.getTime()) / 86400000)
    return { label: MONTHS_PT_ABBR[i]!, pct: (offset / totalDays) * 100 }
  })

  const bars = ferias.flatMap((f) => {
    const s = parseDMY(f.dataInicio)
    const e = parseDMY(f.dataFim)
    const cs = s < startOfYear ? startOfYear : s
    const ce = e > endOfYear ? endOfYear : e
    if (ce < cs) return []
    const so = Math.round((cs.getTime() - startOfYear.getTime()) / 86400000)
    const eo = Math.round((ce.getTime() - startOfYear.getTime()) / 86400000)
    return [{
      left: (so / totalDays) * 100,
      width: ((eo - so + 1) / totalDays) * 100,
      label: `${f.dataInicio.slice(0, 10)} → ${f.dataFim.slice(0, 10)}${f.nota ? ' — ' + f.nota : ''}`,
    }]
  })

  if (ferias.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Sem férias registadas para {ano}.</p>
  }

  return (
    <div className="space-y-1.5">
      {/* Month labels */}
      <div className="relative h-4">
        {months.map((m) => (
          <span
            key={m.label}
            className="absolute text-[10px] text-muted-foreground"
            style={{ left: `${m.pct}%` }}
          >
            {m.label}
          </span>
        ))}
      </div>
      {/* Timeline */}
      <div className="relative h-7 overflow-hidden rounded-md bg-muted/30">
        {months.slice(1).map((m) => (
          <div
            key={m.label}
            className="absolute inset-y-0 w-px bg-border/50"
            style={{ left: `${m.pct}%` }}
          />
        ))}
        {bars.map((b, i) => (
          <div
            key={i}
            className="absolute inset-y-1 rounded-sm bg-blue-500/80 hover:bg-blue-600 transition-colors cursor-default"
            style={{ left: `${b.left}%`, width: `${b.width}%` }}
            title={b.label}
          />
        ))}
      </div>
      {/* Period list */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
        {ferias.map((f, i) => (
          <span key={i} className="whitespace-nowrap">
            <span className="inline-block h-2 w-2 rounded-sm bg-blue-500/80 mr-1 align-middle" />
            {f.dataInicio.slice(0, 10)} → {f.dataFim.slice(0, 10)}
            {f.nota && <span className="ml-1 opacity-70">({f.nota})</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function EstatisticaInspetorDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('custom')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const [feriasByYear, setFeriasByYear] = useState<FeriasPeriod[]>([])

  function applyPreset(p: Preset) {
    setPreset(p)
    if (p === 'custom') return
    const [from, to] = rangeForPreset(p)
    setDataInicio(from)
    setDataFim(to)
  }

  function onDataChange(setter: (v: string) => void, value: string) {
    setter(value)
    if (preset !== 'custom') setPreset('custom')
  }

  const fetchStats = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (dataInicio) params.set('dataInicio', dataInicio)
    if (dataFim) params.set('dataFim', dataFim)

    const res = await fetch(`/api/estatisticas/own?${params}`)
    if (res.ok) setStats(await res.json())
    else setStats(null)
    setLoading(false)
  }, [dataInicio, dataFim])

  useEffect(() => { fetchStats() }, [fetchStats])

  useEffect(() => {
    fetch(`/api/ausencias?ano=${currentYear}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ausencias) {
          setFeriasByYear(
            (d.ausencias as (FeriasPeriod & { tipo: string })[]).filter((a) => a.tipo === 'FERIAS')
          )
        }
      })
      .catch(() => {})
  }, [currentYear])

  const hasDateFilter = !!(dataInicio || dataFim)
  const periodLabel = useMemo(() => {
    if (preset !== 'custom') return PRESET_LABELS[preset]
    if (!hasDateFilter) return 'Todo o histórico'
    return `${dataInicio || '…'} → ${dataFim || '…'}`
  }, [preset, dataInicio, dataFim, hasDateFilter])

  function clearFilters() {
    setPreset('custom')
    setDataInicio('')
    setDataFim('')
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Período</Label>
          <Select value={preset} onValueChange={(v) => applyPreset(v as Preset)}>
            <SelectTrigger className="h-9 w-full sm:w-[170px] text-sm">
              <SelectValue placeholder="Período">
                {(v: string) => PRESET_LABELS[v as Preset] ?? 'Período'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
                <SelectItem key={p} value={p}>{PRESET_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Data início</Label>
          <Input
            type="date"
            value={dataInicio}
            onChange={(e) => onDataChange(setDataInicio, e.target.value)}
            className="h-9 w-full sm:w-[150px] text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Data fim</Label>
          <Input
            type="date"
            value={dataFim}
            onChange={(e) => onDataChange(setDataFim, e.target.value)}
            className="h-9 w-full sm:w-[150px] text-sm"
          />
        </div>

        {hasDateFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="gap-1.5 text-muted-foreground h-9"
          >
            <X className="h-3.5 w-3.5" />
            Limpar
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        A mostrar dados de: <span className="font-medium text-foreground">{periodLabel}</span>
      </p>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">A carregar...</div>
      ) : stats ? (
        <>
          {/* Inquiry summary cards — Cartas Precatórias is separated below */}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total</span>
                </div>
                <p className="text-3xl font-bold mt-1">{stats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-muted-foreground">Concluídos</span>
                </div>
                <p className="text-3xl font-bold mt-1 text-green-700">{stats.concluidos}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <MonitorCog className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-muted-foreground">Aguarda Exames</span>
                </div>
                <p className="text-3xl font-bold mt-1 text-purple-700">{stats.aguardaExames}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-blue-500" />
                  <span className="text-sm text-muted-foreground">Enviados</span>
                </div>
                <p className="text-3xl font-bold mt-1 text-blue-700">{stats.enviados}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-muted-foreground">Arquivados</span>
                </div>
                <p className="text-3xl font-bold mt-1 text-gray-600">{stats.arquivados}</p>
              </CardContent>
            </Card>
          </div>

          {/* Distribution chart — between Inquéritos and C. Precatórias */}
          {stats.total > 0 && stats.porEstado.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Distribuição por estado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex h-5 overflow-hidden rounded-full">
                  {stats.porEstado.filter((e) => e.count > 0).map((e) => (
                    <div
                      key={e.estadoId}
                      className="h-full hover:opacity-80 transition-opacity cursor-default"
                      style={{ width: `${(e.count / stats.total) * 100}%`, backgroundColor: e.cor ?? '#888' }}
                      title={`${e.nome}: ${e.count} (${Math.round((e.count / stats.total) * 100)}%)`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {stats.porEstado.filter((e) => e.count > 0).map((e) => (
                    <div key={e.estadoId} className="flex items-center gap-1.5 text-xs">
                      <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: e.cor ?? '#888' }} />
                      <span className="text-muted-foreground">{e.nome}</span>
                      <span className="font-medium">{e.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cartas Precatórias */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-muted-foreground">Cartas Precatórias</span>
              </div>
              <p className="text-3xl font-bold mt-1 text-orange-600">{stats.cartasPrecatorias}</p>
            </CardContent>
          </Card>

          {/* Charts row 1 */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <EstadoBarChart data={stats.porEstado} />
              </CardContent>
            </Card>
            {stats.porAno.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Ano de abertura</CardTitle>
                </CardHeader>
                <CardContent>
                  <AnoBarChart data={stats.porAno} />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Charts row 2 */}
          {stats.porNatureza.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Tipo de crime</CardTitle>
                </CardHeader>
                <CardContent>
                  <NaturezaBarChart data={stats.porNatureza} />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Ausências — Férias */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                Ausências — Férias {currentYear}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FeriasYearBar ferias={feriasByYear} ano={currentYear} />
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Não foi possível carregar as estatísticas.
        </div>
      )}
    </div>
  )
}
