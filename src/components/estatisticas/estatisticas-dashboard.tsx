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
  BrigadaBarChart,
  InspetorBarChart,
  NaturezaBarChart,
  AnoBarChart,
  ComarcaBarChart,
  TribunalBarChart,
  TipoInqueritoChart,
} from './charts'
import { FileText, Users, X, ClipboardList, MonitorCog, Send, Archive, Share2, Activity, Mail } from 'lucide-react'

interface Brigada { id: string; nome: string }
interface Inspetor { id: string; nome: string; brigadaId: string | null }

interface Stats {
  total: number
  cartaPrecatoriaCount: number
  ativos: number
  vencidos: number
  semInspetor: number
  distribuido: number
  aguardaExames: number
  enviados: number
  arquivados: number
  porEstado: { estadoId: string; codigo: string; nome: string; cor: string | null; count: number }[]
  porBrigada: { brigadaId: string; nome: string; count: number }[]
  porInspetor: { inspetorId: string; nome: string; count: number }[]
  porNatureza: { natureza: string; count: number }[]
  porAno: { ano: string; count: number }[]
  porComarca: { comarcaId: string; nome: string; count: number }[]
  porTribunal: { tribunalId: string; nome: string; count: number }[]
  atividadesInspetor: {
    descricao: string
    count: number
    sumQuantidade: number
    temQuantidade: boolean
  }[]
  atividadesInspetorTotal: number
}

interface Props {
  brigadas: Brigada[]
  inspetores: Inspetor[]
  /** When true, the brigada filter is hidden and the API enforces own-brigade scope. */
  lockedToBrigada?: boolean
}

type Preset = 'custom' | 'this_month' | 'last_month' | 'this_year' | 'last_30'

const PRESET_LABELS: Record<Preset, string> = {
  custom: 'Período personalizado',
  this_month: 'Este mês',
  last_month: 'Mês passado',
  last_30: 'Últimos 30 dias',
  this_year: 'Este ano',
}

/** Returns [dataInicio, dataFim] (yyyy-mm-dd) for a preset, or [empty, empty]. */
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

function StatsTable({ data, total }: { data: { nome: string; count: number }[]; total: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs">
            <th className="text-left py-1.5 pr-3 font-medium w-6">#</th>
            <th className="text-left py-1.5 pr-3 font-medium">Nome</th>
            <th className="text-right py-1.5 pr-3 font-medium">Inquéritos</th>
            <th className="text-right py-1.5 font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={r.nome} className="border-b last:border-0">
              <td className="py-1.5 pr-3 text-muted-foreground text-xs">{i + 1}</td>
              <td className="py-1.5 pr-3 truncate max-w-[200px]">{r.nome}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{r.count}</td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground text-xs">
                {total > 0 ? ((r.count / total) * 100).toFixed(1) + '%' : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EstatisticasDashboard({
  brigadas,
  inspetores,
  lockedToBrigada = false,
}: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [brigadaFilter, setBrigadaFilter] = useState('')
  const [inspetorFilter, setInspetorFilter] = useState('')
  const [preset, setPreset] = useState<Preset>('custom')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // When a brigada is selected, restrict the inspetor list to that brigada.
  const filteredInspetores = useMemo(() => {
    if (!brigadaFilter) return inspetores
    return inspetores.filter((i) => i.brigadaId === brigadaFilter)
  }, [brigadaFilter, inspetores])

  // Atomic handler: change brigada + reset inspetor in the same render so the
  // fetchStats effect only fires once with a coherent filter combination.
  function changeBrigada(next: string) {
    setBrigadaFilter(next)
    if (
      inspetorFilter &&
      !inspetores.some((i) => i.id === inspetorFilter && i.brigadaId === next)
    ) {
      setInspetorFilter('')
    }
  }

  // When a preset is chosen, fill the dates; "custom" preserves manual values.
  function applyPreset(p: Preset) {
    setPreset(p)
    if (p === 'custom') return
    const [from, to] = rangeForPreset(p)
    setDataInicio(from)
    setDataFim(to)
  }

  // If the user manually edits a date while a preset is active, drop back to "custom".
  function onDataChange(setter: (v: string) => void, value: string) {
    setter(value)
    if (preset !== 'custom') setPreset('custom')
  }

  const fetchStats = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (brigadaFilter && !lockedToBrigada) params.set('brigadaId', brigadaFilter)
    if (inspetorFilter) params.set('inspetorId', inspetorFilter)
    if (dataInicio) params.set('dataInicio', dataInicio)
    if (dataFim) params.set('dataFim', dataFim)

    const res = await fetch(`/api/estatisticas?${params}`)
    if (res.ok) setStats(await res.json())
    else setStats(null)
    setLoading(false)
  }, [brigadaFilter, inspetorFilter, dataInicio, dataFim, lockedToBrigada])

  useEffect(() => { fetchStats() }, [fetchStats])

  const hasDateFilter = !!(dataInicio || dataFim)
  const periodLabel = useMemo(() => {
    if (preset !== 'custom') return PRESET_LABELS[preset]
    if (!hasDateFilter) return 'Todo o histórico'
    return `${dataInicio || '…'} → ${dataFim || '…'}`
  }, [preset, dataInicio, dataFim, hasDateFilter])

  function clearFilters() {
    setBrigadaFilter('')
    setInspetorFilter('')
    setPreset('custom')
    setDataInicio('')
    setDataFim('')
  }

  const hasAnyFilter =
    (!!brigadaFilter && !lockedToBrigada) || !!inspetorFilter || hasDateFilter

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-3 items-end">
        {!lockedToBrigada && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Brigada</Label>
            <Select
              value={brigadaFilter || 'all'}
              onValueChange={(v) => changeBrigada(!v || v === 'all' ? '' : v)}
            >
              <SelectTrigger className="h-9 w-full sm:w-[180px] text-sm">
                <SelectValue placeholder="Todas as brigadas">
                  {(v: string) =>
                    !v || v === 'all'
                      ? 'Todas as brigadas'
                      : brigadas.find((b) => b.id === v)?.nome ?? 'Todas as brigadas'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as brigadas</SelectItem>
                {brigadas.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {filteredInspetores.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Inspetor</Label>
            <Select
              value={inspetorFilter || 'all'}
              onValueChange={(v) => setInspetorFilter(!v || v === 'all' ? '' : v)}
            >
              <SelectTrigger className="h-9 w-full sm:w-[180px] text-sm">
                <SelectValue placeholder="Todos os inspetores">
                  {(v: string) =>
                    !v || v === 'all'
                      ? 'Todos os inspetores'
                      : filteredInspetores.find((i) => i.id === v)?.nome ??
                        'Todos os inspetores'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os inspetores</SelectItem>
                {filteredInspetores.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Período</Label>
          <Select value={preset} onValueChange={(v) => applyPreset(v as Preset)}>
            <SelectTrigger className="h-9 w-full sm:w-56 text-sm">
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
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
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
                  <Mail className="h-4 w-4 text-orange-500" />
                  <span className="text-sm text-muted-foreground">C. Precatórias</span>
                </div>
                <p className="text-3xl font-bold mt-1 text-orange-600 dark:text-orange-400">{stats.cartaPrecatoriaCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-muted-foreground">Ativos</span>
                </div>
                <p className="text-3xl font-bold mt-1 text-green-700 dark:text-green-400">{stats.ativos}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Sem inspetor</span>
                </div>
                <p className="text-3xl font-bold mt-1">{stats.semInspetor}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-muted-foreground">Distribuídos</span>
                </div>
                <p className="text-3xl font-bold mt-1 text-purple-700 dark:text-purple-400">{stats.distribuido}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <MonitorCog className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-muted-foreground">Aguarda Exames</span>
                </div>
                <p className="text-3xl font-bold mt-1 text-purple-700 dark:text-purple-400">{stats.aguardaExames}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-blue-500" />
                  <span className="text-sm text-muted-foreground">Enviados</span>
                </div>
                <p className="text-3xl font-bold mt-1 text-blue-700 dark:text-blue-400">{stats.enviados}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-muted-foreground">Arquivados</span>
                </div>
                <p className="text-3xl font-bold mt-1 text-gray-600 dark:text-gray-400">{stats.arquivados}</p>
              </CardContent>
            </Card>
          </div>

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

          {/* Tipo de Inquérito: Inquéritos vs Cartas Precatórias */}
          {stats.cartaPrecatoriaCount > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Inquéritos vs Cartas Precatórias</CardTitle>
              </CardHeader>
              <CardContent>
                <TipoInqueritoChart total={stats.total} cartaPrecatoria={stats.cartaPrecatoriaCount} />
              </CardContent>
            </Card>
          )}

          {/* Charts row 2 */}
          <div className="grid gap-4 md:grid-cols-2">
            {!lockedToBrigada && stats.porBrigada.length > 1 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Por Brigada</CardTitle>
                </CardHeader>
                <CardContent>
                  <BrigadaBarChart data={stats.porBrigada} />
                </CardContent>
              </Card>
            )}
            {/* When an inspetor is selected, the "Por Inspetor" chart would be a
                single bar — replace it with a breakdown of that inspetor's
                actividades in the selected period (filtered by
                atividade.dataRealizacao, not inquérito.dataAbertura). */}
            {inspetorFilter ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <ClipboardList className="h-4 w-4" />
                    Atividades do Inspetor
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums">
                      {stats.atividadesInspetorTotal}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      atividade{stats.atividadesInspetorTotal === 1 ? '' : 's'} no período
                    </span>
                  </div>

                  {stats.atividadesInspetor.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      Sem atividades registadas nestes filtros.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {stats.atividadesInspetor.map((a) => {
                        // Atividades-padrão com `temQuantidade` reportam a quantidade
                        // somada; as restantes reportam o número de linhas.
                        const display =
                          a.temQuantidade && a.sumQuantidade > 0
                            ? a.sumQuantidade
                            : a.count
                        return (
                          <div
                            key={a.descricao}
                            className="flex items-center justify-between text-sm gap-3"
                          >
                            <span className="text-muted-foreground truncate">
                              {a.descricao}
                            </span>
                            <span className="font-medium tabular-nums shrink-0">
                              {display}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground pt-2 border-t">
                    Período aplicado à data de realização da atividade.
                  </p>
                </CardContent>
              </Card>
            ) : (
              stats.porInspetor.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Por Inspetor</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <InspetorBarChart data={stats.porInspetor} />
                  </CardContent>
                </Card>
              )
            )}
            {stats.porNatureza.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Tipo de crime</CardTitle>
                </CardHeader>
                <CardContent>
                  <NaturezaBarChart data={stats.porNatureza} />
                </CardContent>
              </Card>
            )}
          </div>

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

          {/* Tribunal — full-width chart + table */}
          {stats.porTribunal.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Por Tribunal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 lg:grid-cols-2">
                  <TribunalBarChart data={stats.porTribunal.slice(0, 15)} />
                  <StatsTable data={stats.porTribunal} total={stats.total} />
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
