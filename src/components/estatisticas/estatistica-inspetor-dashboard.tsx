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
import { Checkbox } from '@/components/ui/checkbox'
import {
  EstadoBarChart,
  NaturezaBarChart,
  AnoBarChart,
  ComarcaBarChart,
  StatsTable,
} from './charts'
import { FileText, MonitorCog, Send, Archive, CheckCircle2, X, Mail, AlertTriangle } from 'lucide-react'

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
  porComarca: { comarcaId: string; nome: string; count: number }[]
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

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function EstatisticaInspetorDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState<Preset>('custom')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [incluirTerminados, setIncluirTerminados] = useState(false)

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
    if (incluirTerminados) params.set('incluirTerminados', '1')

    const res = await fetch(`/api/estatisticas/own?${params}`)
    if (res.ok) setStats(await res.json())
    else setStats(null)
    setLoading(false)
  }, [dataInicio, dataFim, incluirTerminados])

  useEffect(() => { fetchStats() }, [fetchStats])

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
    setIncluirTerminados(false)
  }

  const hasAnyFilter = hasDateFilter || incluirTerminados

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Período</Label>
          <Select value={preset} onValueChange={(v) => applyPreset(v as Preset)}>
            <SelectTrigger className="h-9 w-full sm:w-[28rem] text-sm">
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

        <label className="flex items-center gap-2 h-9 text-sm cursor-pointer">
          <Checkbox
            checked={incluirTerminados}
            onCheckedChange={(v) => setIncluirTerminados(v === true)}
          />
          Incluir arquivados e concluídos
        </label>

        {hasAnyFilter && (
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
          {/* Summary cards */}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
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
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-muted-foreground">Vencidos</span>
                </div>
                <p className="text-3xl font-bold mt-1 text-red-600">{stats.vencidos}</p>
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
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-orange-500" />
                  <span className="text-sm text-muted-foreground">C. Precatórias</span>
                </div>
                <p className="text-3xl font-bold mt-1 text-orange-600">{stats.cartasPrecatorias}</p>
              </CardContent>
            </Card>
          </div>

          {/* Inquéritos vs Cartas Precatórias comparison */}
          {stats.total > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Inquéritos vs Cartas Precatórias</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex h-5 overflow-hidden rounded-full">
                  <div
                    className="h-full bg-blue-500/80 hover:opacity-80 transition-opacity cursor-default"
                    style={{ width: `${((stats.total - stats.cartasPrecatorias) / stats.total) * 100}%` }}
                    title={`Inquéritos: ${stats.total - stats.cartasPrecatorias} (${Math.round(((stats.total - stats.cartasPrecatorias) / stats.total) * 100)}%)`}
                  />
                  <div
                    className="h-full bg-orange-400/80 hover:opacity-80 transition-opacity cursor-default"
                    style={{ width: `${(stats.cartasPrecatorias / stats.total) * 100}%` }}
                    title={`Cartas Precatórias: ${stats.cartasPrecatorias} (${Math.round((stats.cartasPrecatorias / stats.total) * 100)}%)`}
                  />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-2.5 w-2.5 rounded-sm shrink-0 bg-blue-500/80" />
                    <span className="text-muted-foreground">Inquéritos</span>
                    <span className="font-medium">{stats.total - stats.cartasPrecatorias}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-2.5 w-2.5 rounded-sm shrink-0 bg-orange-400/80" />
                    <span className="text-muted-foreground">Cartas Precatórias</span>
                    <span className="font-medium">{stats.cartasPrecatorias}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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

          {/* Comarca — full-width chart + table */}
          {stats.porComarca.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Por Comarca</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 lg:grid-cols-2">
                  <ComarcaBarChart data={stats.porComarca} />
                  <StatsTable data={stats.porComarca} total={stats.total} />
                </div>
              </CardContent>
            </Card>
          )}

        </>
      ) : (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Não foi possível carregar as estatísticas.
        </div>
      )}
    </div>
  )
}
