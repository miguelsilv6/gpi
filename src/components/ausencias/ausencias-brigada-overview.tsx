'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { isWorkingDay, countWorkingDays } from '@/lib/ferias'
import type { MembroFerias, Ausencia, GanttScale } from './types'
import { TIPO_LABEL, TIPO_COR } from './types'

type Scale = GanttScale

interface Props {
  membros: MembroFerias[]
  month: Date
  onMonthChange: (d: Date) => void
  scale: Scale
  onScaleChange: (s: Scale) => void
}

const MONTHS_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

function startOfDay(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const PER_DAY_PX: Record<Scale, number> = { month: 30, quarter: 12, year: 5 }

export function AusenciasBrigadaOverview({ membros, month, onMonthChange, scale, onScaleChange }: Props) {

  const ano = month.getFullYear()
  const mIdx = month.getMonth()

  const { rangeStart, rangeEnd, startMonthIdx } = useMemo(() => {
    if (scale === 'month') {
      return {
        rangeStart: new Date(ano, mIdx, 1),
        rangeEnd: new Date(ano, mIdx + 1, 0),
        startMonthIdx: mIdx,
        endMonthIdx: mIdx,
      }
    }
    if (scale === 'quarter') {
      const qStart = Math.floor(mIdx / 3) * 3
      return {
        rangeStart: new Date(ano, qStart, 1),
        rangeEnd: new Date(ano, qStart + 3, 0),
        startMonthIdx: qStart,
        endMonthIdx: qStart + 2,
      }
    }
    return {
      rangeStart: new Date(ano, 0, 1),
      rangeEnd: new Date(ano, 12, 0),
      startMonthIdx: 0,
      endMonthIdx: 11,
    }
  }, [scale, ano, mIdx])

  const { dayList, indexByKey } = useMemo(() => {
    const list: { date: Date; key: string; day: number; monthIdx: number; nonWorking: boolean }[] = []
    const map = new Map<string, number>()
    const cursor = new Date(rangeStart)
    let i = 0
    while (cursor <= rangeEnd) {
      const key = dayKey(cursor)
      list.push({
        date: new Date(cursor),
        key,
        day: cursor.getDate(),
        monthIdx: cursor.getMonth(),
        nonWorking: !isWorkingDay(cursor),
      })
      map.set(key, i)
      i++
      cursor.setDate(cursor.getDate() + 1)
    }
    return { dayList: list, indexByKey: map }
  }, [rangeStart, rangeEnd])

  const total = dayList.length
  const todayKey = dayKey(new Date())

  const absentPerDay = useMemo(() => {
    const counts = new Array(total).fill(0)
    const parsed = membros.map((m) =>
      m.ausencias.map((a) => ({
        inicio: startOfDay(new Date(a.dataInicio)),
        fim: startOfDay(new Date(a.dataFim)),
      })),
    )
    for (let idx = 0; idx < total; idx++) {
      const date = dayList[idx]!.date
      for (const ausencias of parsed) {
        if (ausencias.some((a) => a.inicio <= date && date <= a.fim)) counts[idx]++
      }
    }
    return counts
  }, [membros, dayList, total])

  const monthBands = useMemo(() => {
    const bands: { monthIdx: number; count: number }[] = []
    for (const d of dayList) {
      const last = bands[bands.length - 1]
      if (last && last.monthIdx === d.monthIdx) last.count++
      else bands.push({ monthIdx: d.monthIdx, count: 1 })
    }
    return bands
  }, [dayList])

  function barFor(a: Ausencia): { left: number; width: number; dias: number } | null {
    const inicio = startOfDay(new Date(a.dataInicio))
    const fim = startOfDay(new Date(a.dataFim))
    const clampStart = inicio < rangeStart ? rangeStart : inicio
    const clampEnd = fim > rangeEnd ? rangeEnd : fim
    if (clampEnd < clampStart) return null
    const startIdx = indexByKey.get(dayKey(clampStart))
    const endIdx = indexByKey.get(dayKey(clampEnd))
    if (startIdx == null || endIdx == null) return null
    const toUtcDay = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dias = countWorkingDays(toUtcDay(clampStart), toUtcDay(clampEnd))
    return {
      left: (startIdx / total) * 100,
      width: ((endIdx - startIdx + 1) / total) * 100,
      dias,
    }
  }

  const minWidth = Math.max(total * PER_DAY_PX[scale], 320)
  const showDayNumbers = scale === 'month'

  function shift(dir: -1 | 1) {
    if (scale === 'month') onMonthChange(new Date(ano, mIdx + dir, 1))
    else if (scale === 'quarter') onMonthChange(new Date(ano, startMonthIdx + dir * 3, 1))
    else onMonthChange(new Date(ano + dir, mIdx, 1))
  }

  const rangeLabel =
    scale === 'month'
      ? format(month, 'MMMM yyyy', { locale: ptBR })
      : scale === 'quarter'
        ? `${Math.floor(startMonthIdx / 3) + 1}.º trimestre ${ano}`
        : String(ano)

  return (
    <div className="space-y-4">
      {/* Counters table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Totais por inspetor — {ano}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-1.5 pr-3 font-medium">Inspetor</th>
                  <th className="text-right py-1.5 pr-3 font-medium">Férias</th>
                  <th className="text-right py-1.5 pr-3 font-medium">Folgas</th>
                  <th className="text-right py-1.5 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {membros.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 truncate max-w-[220px]">{m.nome}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{m.totais.ferias}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{m.totais.folga}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{m.totais.total}</td>
                  </tr>
                ))}
                {membros.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted-foreground">
                      Sem inspetores nesta brigada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Gantt timeline — grelha oculta em mobile (demasiado apertada), mas o cabeçalho
          com os controlos de mês/trimestre/ano mantém-se visível: a tabela de totais
          acima também depende deste estado de período. */}
      <Card>
        <CardHeader className="pb-2 flex-row flex-wrap items-center justify-between space-y-0 gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground capitalize">
            {rangeLabel}
          </CardTitle>
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
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label="Anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => shift(1)} aria-label="Seguinte">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="hidden md:block">
          {membros.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem dados para apresentar.</p>
          ) : (
            <div className="flex overflow-hidden">
              <div className="w-32 shrink-0">
                <div className={showDayNumbers ? 'h-12 border-b' : 'h-9 border-b'} />
                {membros.map((m) => (
                  <div
                    key={m.id}
                    className="flex h-8 items-center border-b pr-2 text-xs truncate"
                    title={m.nome}
                  >
                    {m.nome}
                  </div>
                ))}
              </div>

              <div className="flex-1 overflow-x-auto">
                <div style={{ minWidth }}>
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

                  <div
                    className={(showDayNumbers ? 'h-7' : 'h-4') + ' grid border-b'}
                    style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}
                  >
                    {dayList.map((dm, idx) => {
                      const multi = absentPerDay[idx] > 1
                      const isToday = dm.key === todayKey
                      return (
                        <div
                          key={dm.key}
                          className={
                            'flex items-center justify-center text-[10px] tabular-nums border-l first:border-l-0 ' +
                            (multi
                              ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 font-semibold'
                              : dm.nonWorking
                                ? 'bg-muted text-muted-foreground'
                                : 'text-muted-foreground') +
                            // ring (não bg-*/text-*) para não colidir com as classes de
                            // cor acima — assim "hoje" fica visível mesmo num dia com +1 ausente.
                            (isToday ? ' ring-2 ring-inset ring-primary font-semibold' : '')
                          }
                          title={
                            isToday
                              ? multi
                                ? `Hoje — ${absentPerDay[idx]} inspetores ausentes`
                                : 'Hoje'
                              : multi
                                ? `${absentPerDay[idx]} inspetores ausentes em ${format(dm.date, 'dd/MM/yyyy')}`
                                : undefined
                          }
                        >
                          {showDayNumbers ? dm.day : ''}
                        </div>
                      )
                    })}
                  </div>

                  {membros.map((m) => (
                    <div key={m.id} className="relative h-8 border-b">
                      <div
                        className="absolute inset-0 grid"
                        style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}
                      >
                        {dayList.map((dm) => (
                          <div
                            key={dm.key}
                            className={
                              'border-l first:border-l-0 ' +
                              (dm.key === todayKey ? 'bg-primary/10' : dm.nonWorking ? 'bg-muted/60' : '')
                            }
                          />
                        ))}
                      </div>
                      <TooltipProvider>
                        {m.ausencias.map((a) => {
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
                                <p>
                                  {bar.dias} dia{bar.dias === 1 ? '' : 's'}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )
                        })}
                      </TooltipProvider>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <Legend />
        </CardContent>
      </Card>
    </div>
  )
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded bg-blue-500/80" /> Férias
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded bg-amber-500/80" /> Folga
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded bg-muted" /> Fim de semana / feriado
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded bg-red-200 dark:bg-red-950/60" /> +1 ausente
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded bg-primary" /> Hoje
      </span>
    </div>
  )
}
