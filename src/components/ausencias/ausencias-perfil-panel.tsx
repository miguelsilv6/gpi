'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarDays,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { isWorkingDay, countWorkingDays } from '@/lib/ferias'
import { AusenciasCalendar } from './ausencias-calendar'
import type { Ausencia, TipoAusencia, Totais, GanttScale } from './types'
import { TIPO_LABEL, TIPO_COR } from './types'

type Scale = GanttScale

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const PER_DAY_PX: Record<Scale, number> = { month: 30, quarter: 12, year: 5 }

function startOfLocal(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// ─── Personal Gantt ────────────────────────────────────────────────────────────

interface GanttProps {
  ausencias: Ausencia[]
  month: Date
  onMonthChange: (d: Date) => void
  scale: Scale
  onScaleChange: (s: Scale) => void
}

function PersonalGantt({ ausencias, month, onMonthChange, scale, onScaleChange }: GanttProps) {
  const ano = month.getFullYear()
  const mIdx = month.getMonth()

  const { rangeStart, rangeEnd, startMonthIdx } = useMemo(() => {
    if (scale === 'month') {
      return { rangeStart: new Date(ano, mIdx, 1), rangeEnd: new Date(ano, mIdx + 1, 0), startMonthIdx: mIdx }
    }
    if (scale === 'quarter') {
      const qStart = Math.floor(mIdx / 3) * 3
      return { rangeStart: new Date(ano, qStart, 1), rangeEnd: new Date(ano, qStart + 3, 0), startMonthIdx: qStart }
    }
    return { rangeStart: new Date(ano, 0, 1), rangeEnd: new Date(ano, 12, 0), startMonthIdx: 0 }
  }, [scale, ano, mIdx])

  const { dayList, indexByKey } = useMemo(() => {
    const list: { date: Date; key: string; day: number; monthIdx: number; nonWorking: boolean }[] = []
    const map = new Map<string, number>()
    const cursor = new Date(rangeStart)
    let i = 0
    while (cursor <= rangeEnd) {
      const key = dayKey(cursor)
      list.push({ date: new Date(cursor), key, day: cursor.getDate(), monthIdx: cursor.getMonth(), nonWorking: !isWorkingDay(cursor) })
      map.set(key, i++)
      cursor.setDate(cursor.getDate() + 1)
    }
    return { dayList: list, indexByKey: map }
  }, [rangeStart, rangeEnd])

  const total = dayList.length

  const monthBands = useMemo(() => {
    const bands: { monthIdx: number; count: number }[] = []
    for (const d of dayList) {
      const last = bands[bands.length - 1]
      if (last && last.monthIdx === d.monthIdx) last.count++
      else bands.push({ monthIdx: d.monthIdx, count: 1 })
    }
    return bands
  }, [dayList])

  function barFor(a: Ausencia) {
    const inicio = startOfLocal(new Date(a.dataInicio))
    const fim = startOfLocal(new Date(a.dataFim))
    const clampStart = inicio < rangeStart ? rangeStart : inicio
    const clampEnd = fim > rangeEnd ? rangeEnd : fim
    if (clampEnd < clampStart) return null
    const startIdx = indexByKey.get(dayKey(clampStart))
    const endIdx = indexByKey.get(dayKey(clampEnd))
    if (startIdx == null || endIdx == null) return null
    const toUtc = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dias = countWorkingDays(toUtc(clampStart), toUtc(clampEnd))
    return { left: (startIdx / total) * 100, width: ((endIdx - startIdx + 1) / total) * 100, dias }
  }

  const minWidth = Math.max(total * PER_DAY_PX[scale], 320)
  const showDayNumbers = scale === 'month'

  function shift(dir: -1 | 1) {
    if (scale === 'month') onMonthChange(new Date(ano, mIdx + dir, 1))
    else if (scale === 'quarter') onMonthChange(new Date(ano, startMonthIdx + dir * 3, 1))
    else onMonthChange(new Date(ano + dir, mIdx, 1))
  }

  const rangeLabel = scale === 'month'
    ? format(month, 'MMMM yyyy', { locale: ptBR })
    : scale === 'quarter'
      ? `${Math.floor(startMonthIdx / 3) + 1}.º trimestre ${ano}`
      : String(ano)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium capitalize">{rangeLabel}</span>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            {(['month', 'quarter', 'year'] as Scale[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onScaleChange(s)}
                className={
                  'rounded px-2 py-0.5 text-xs transition-colors ' +
                  (scale === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')
                }
              >
                {s === 'month' ? 'Mês' : s === 'quarter' ? 'Trimestre' : 'Ano'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shift(-1)} aria-label="Período anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shift(1)} aria-label="Período seguinte">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {ausencias.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sem ausências registadas neste período.</p>
      ) : (
        <div className="overflow-hidden rounded border">
          <div className="overflow-x-auto">
            <div style={{ minWidth }}>
              {/* Month header row */}
              <div className="flex h-5 border-b">
                {monthBands.map((b, i) => (
                  <div
                    key={`${b.monthIdx}-${i}`}
                    className="flex items-center justify-center border-l first:border-l-0 text-[10px] font-medium text-muted-foreground overflow-hidden"
                    style={{ width: `${(b.count / total) * 100}%` }}
                  >
                    {MONTHS_PT[b.monthIdx]}
                  </div>
                ))}
              </div>

              {/* Day numbers row */}
              <div
                className={(showDayNumbers ? 'h-7' : 'h-4') + ' grid border-b'}
                style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}
              >
                {dayList.map((dm) => (
                  <div
                    key={dm.key}
                    className={
                      'flex items-center justify-center text-[10px] tabular-nums border-l first:border-l-0 ' +
                      (dm.nonWorking ? 'bg-muted text-muted-foreground' : 'text-muted-foreground')
                    }
                  >
                    {showDayNumbers ? dm.day : ''}
                  </div>
                ))}
              </div>

              {/* Bars row */}
              <div className="relative h-8">
                <div
                  className="absolute inset-0 grid"
                  style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}
                >
                  {dayList.map((dm) => (
                    <div key={dm.key} className={'border-l first:border-l-0 ' + (dm.nonWorking ? 'bg-muted/60' : '')} />
                  ))}
                </div>
                <TooltipProvider>
                  {ausencias.map((a) => {
                    const bar = barFor(a)
                    if (!bar) return null
                    return (
                      <Tooltip key={a.id}>
                        <TooltipTrigger
                          className={`absolute top-1.5 bottom-1.5 rounded cursor-default ${TIPO_COR[a.tipo].bar}`}
                          style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                        />
                        <TooltipContent side="top" className="text-center">
                          <p className="font-semibold">{TIPO_LABEL[a.tipo]}</p>
                          <p className="opacity-80">
                            {a.dataInicio.slice(0, 10)} → {a.dataFim.slice(0, 10)}
                          </p>
                          <p>{bar.dias} dia{bar.dias === 1 ? '' : 's'} útei{bar.dias === 1 ? 'l' : 's'}</p>
                          {a.nota && <p className="text-xs opacity-70 mt-0.5 max-w-[160px]">{a.nota}</p>}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-blue-500/80" /> Férias
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-amber-500/80" /> Folga
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-muted border" /> Fim de semana / feriado
        </span>
      </div>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function AusenciasPerfilPanel() {
  const now = new Date()
  const [ausencias, setAusencias] = useState<Ausencia[]>([])
  const [totais, setTotais] = useState<Totais | null>(null)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)

  const [ganttMonth, setGanttMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [ganttScale, setGanttScale] = useState<Scale>('year')
  const [calMonth, setCalMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1))

  const [addOpen, setAddOpen] = useState(false)
  const [busyAdd, setBusyAdd] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const ano = ganttMonth.getFullYear()

  const fetchAusencias = useCallback(async (year: number, signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/ausencias?ano=${year}`, { signal })
      if (res.status === 503 || res.status === 403 || res.status === 401) {
        setVisible(false)
        setLoading(false)
        return
      }
      if (!res.ok) { setLoading(false); return }
      const d = await res.json()
      setAusencias(d.ausencias ?? [])
      setTotais(d.totais ?? null)
      setVisible(true)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      // silently ignore — module may not be available
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchAusencias(ano, controller.signal)
    return () => controller.abort()
  }, [ano, fetchAusencias])

  async function handleCreate(payload: {
    tipo: TipoAusencia
    dataInicio: string
    dataFim: string
    nota: string | null
  }): Promise<boolean> {
    setBusyAdd(true)
    try {
      const res = await fetch('/api/ausencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        toast.error(e.error ?? 'Erro ao registar ausência')
        return false
      }
      toast.success('Ausência registada')
      setAddOpen(false)
      await fetchAusencias(ano)
      return true
    } catch {
      toast.error('Erro ao registar ausência')
      return false
    } finally {
      setBusyAdd(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminar esta ausência?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/ausencias/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        toast.error(e.error ?? 'Erro ao eliminar')
        return
      }
      toast.success('Ausência eliminada')
      await fetchAusencias(ano)
    } catch {
      toast.error('Erro ao eliminar')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading || !visible) return null

  const ausSorted = [...ausencias].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio))

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              Ausências — {ano}
            </CardTitle>
            <div className="flex items-center gap-2">
              <HelpButton title="Ajuda — Ausências" className="h-7 text-xs">
                <HelpSection title="Como registar uma ausência">
                  <p>
                    Clique em <strong>Nova ausência</strong>, selecione no calendário o
                    intervalo de datas (clique no dia de início e depois no dia de fim) e
                    escolha o tipo:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 mt-1">
                    <li>
                      <strong className="text-blue-600 dark:text-blue-400">Férias</strong>{' '}
                      — dias de férias anuais.
                    </li>
                    <li>
                      <strong className="text-amber-600 dark:text-amber-400">Folga</strong>{' '}
                      — folgas pontuais ou compensatórias.
                    </li>
                  </ul>
                  <p className="mt-1">
                    Pode adicionar uma nota opcional. Clique em{' '}
                    <strong>Marcar</strong> para guardar.
                  </p>
                </HelpSection>

                <HelpSection title="Contagem de dias úteis">
                  <p>
                    A contagem exclui automaticamente fins-de-semana e feriados nacionais
                    portugueses (incluindo feriados móveis calculados a partir da data da
                    Páscoa). O número de dias úteis é mostrado ao selecionar um intervalo.
                  </p>
                </HelpSection>

                <HelpSection title="Eliminar uma ausência">
                  <p>
                    Na lista de ausências abaixo do gráfico, clique no ícone{' '}
                    <Trash2 className="inline h-3.5 w-3.5 mx-0.5 align-text-bottom" />{' '}
                    à direita de cada entrada para a remover.
                  </p>
                </HelpSection>

                <HelpSection title="Gráfico de Gantt">
                  <p>
                    O gráfico mostra as suas ausências numa linha temporal. Use os botões{' '}
                    <strong>Mês / Trimestre / Ano</strong> para ajustar a escala e as setas
                    para navegar no tempo. Passe o cursor sobre uma barra para ver os
                    detalhes.
                  </p>
                  <p className="mt-1">
                    Os dias a cinzento correspondem a fins-de-semana ou feriados.
                  </p>
                </HelpSection>

                <HelpSection title="Página de Ausências">
                  <p>
                    Para uma visão completa com calendário interativo e a visão da brigada
                    (outros inspetores), aceda à página{' '}
                    <strong>Ausências</strong> no menu lateral.
                  </p>
                </HelpSection>
              </HelpButton>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Nova ausência
              </Button>
            </div>
          </div>

          {/* Year totals */}
          {totais && (totais.ferias > 0 || totais.folga > 0) && (
            <div className="flex flex-wrap gap-4 pt-1">
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="h-2.5 w-4 rounded bg-blue-500/80" />
                <span className="text-muted-foreground">Férias:</span>
                <span className="font-semibold">{totais.ferias} dia{totais.ferias === 1 ? '' : 's'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="h-2.5 w-4 rounded bg-amber-500/80" />
                <span className="text-muted-foreground">Folgas:</span>
                <span className="font-semibold">{totais.folga} dia{totais.folga === 1 ? '' : 's'}</span>
              </span>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Gantt chart */}
          <PersonalGantt
            ausencias={ausencias}
            month={ganttMonth}
            onMonthChange={setGanttMonth}
            scale={ganttScale}
            onScaleChange={setGanttScale}
          />

          {/* Absence list */}
          {ausSorted.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Lista de ausências
              </p>
              <div className="rounded-lg border divide-y text-sm">
                {ausSorted.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-3 py-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium ${TIPO_COR[a.tipo].badge}`}>
                        {TIPO_LABEL[a.tipo]}
                      </span>
                      <span className="tabular-nums text-xs whitespace-nowrap text-muted-foreground">
                        {a.dataInicio.slice(0, 10)} → {a.dataFim.slice(0, 10)}
                      </span>
                      {a.nota && (
                        <span
                          className="text-muted-foreground text-xs truncate max-w-[120px]"
                          title={a.nota}
                        >
                          {a.nota}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                      className="shrink-0 p-1 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                      aria-label="Eliminar ausência"
                    >
                      {deletingId === a.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add absence dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!busyAdd) setAddOpen(o) }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova ausência</DialogTitle>
          </DialogHeader>
          <AusenciasCalendar
            ausencias={ausencias}
            month={calMonth}
            onMonthChange={setCalMonth}
            onCreate={handleCreate}
            busy={busyAdd}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
