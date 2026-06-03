'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { isWorkingDay, countWorkingDays } from '@/lib/ferias'
import type { MembroFerias, Ausencia } from './types'
import { TIPO_LABEL, TIPO_COR } from './types'

interface Props {
  membros: MembroFerias[]
  month: Date
  onMonthChange: (d: Date) => void
}

// Dates arrive from the API as UTC instants — read the calendar day in UTC so
// bars/positions don't shift by ±1 day across client timezones.
function startOfDay(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function FeriasBrigadaOverview({ membros, month, onMonthChange }: Props) {
  const mIdx = month.getMonth()
  const ano = month.getFullYear()
  const daysInMonth = new Date(ano, mIdx + 1, 0).getDate()
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth])

  // Per-day count of how many members are absent (any tipo) — used to flag days
  // where more than one person is away.
  const absentPerDay = useMemo(() => {
    const counts = new Array(daysInMonth + 1).fill(0)
    // Pre-parse each member's ranges once instead of re-allocating Dates inside
    // the nested day loop.
    const parsed = membros.map((m) =>
      m.ausencias.map((a) => ({
        inicio: startOfDay(new Date(a.dataInicio)),
        fim: startOfDay(new Date(a.dataFim)),
      })),
    )
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(ano, mIdx, d)
      for (const ausencias of parsed) {
        if (ausencias.some((a) => a.inicio <= date && date <= a.fim)) counts[d]++
      }
    }
    return counts
  }, [membros, daysInMonth, ano, mIdx])

  const dayMeta = useMemo(
    () =>
      days.map((d) => {
        const date = new Date(ano, mIdx, d)
        return { d, nonWorking: !isWorkingDay(date), multi: absentPerDay[d] > 1 }
      }),
    [days, ano, mIdx, absentPerDay],
  )

  function barFor(a: Ausencia): { left: number; width: number; title: string } | null {
    const monthStart = new Date(ano, mIdx, 1)
    const monthEnd = new Date(ano, mIdx, daysInMonth)
    const inicio = startOfDay(new Date(a.dataInicio))
    const fim = startOfDay(new Date(a.dataFim))
    const clampStart = inicio < monthStart ? monthStart : inicio
    const clampEnd = fim > monthEnd ? monthEnd : fim
    if (clampEnd < clampStart) return null
    const startDay = clampStart.getDate()
    const endDay = clampEnd.getDate()
    const dias = countWorkingDays(new Date(a.dataInicio), new Date(a.dataFim))
    return {
      left: ((startDay - 1) / daysInMonth) * 100,
      width: ((endDay - startDay + 1) / daysInMonth) * 100,
      title: `${TIPO_LABEL[a.tipo]} • ${a.dataInicio.slice(0, 10)} → ${a.dataFim.slice(0, 10)} • ${dias} dia(s) úteis`,
    }
  }

  const minWidth = Math.max(daysInMonth * 30, 320)

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

      {/* Gantt timeline */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground capitalize">
            {format(month, 'MMMM yyyy', { locale: ptBR })}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onMonthChange(new Date(ano, mIdx - 1, 1))}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onMonthChange(new Date(ano, mIdx + 1, 1))}
              aria-label="Mês seguinte"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {membros.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem dados para apresentar.</p>
          ) : (
            <div className="flex">
              {/* Sticky names column */}
              <div className="w-32 shrink-0">
                <div className="h-7 border-b" />
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

              {/* Scrollable timeline */}
              <div className="flex-1 overflow-x-auto">
                <div style={{ minWidth }}>
                  {/* Header day numbers */}
                  <div
                    className="grid h-7 border-b"
                    style={{ gridTemplateColumns: `repeat(${daysInMonth}, 1fr)` }}
                  >
                    {dayMeta.map((dm) => (
                      <div
                        key={dm.d}
                        className={
                          'flex items-center justify-center text-[10px] tabular-nums border-l first:border-l-0 ' +
                          (dm.multi
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 font-semibold'
                            : dm.nonWorking
                              ? 'bg-muted text-muted-foreground'
                              : 'text-muted-foreground')
                        }
                        title={dm.multi ? `${absentPerDay[dm.d]} inspetores ausentes` : undefined}
                      >
                        {dm.d}
                      </div>
                    ))}
                  </div>

                  {/* One row per member */}
                  {membros.map((m) => (
                    <div key={m.id} className="relative h-8 border-b">
                      {/* Background day cells (weekend/holiday shading) */}
                      <div
                        className="absolute inset-0 grid"
                        style={{ gridTemplateColumns: `repeat(${daysInMonth}, 1fr)` }}
                      >
                        {dayMeta.map((dm) => (
                          <div
                            key={dm.d}
                            className={
                              'border-l first:border-l-0 ' +
                              (dm.nonWorking ? 'bg-muted/60' : '')
                            }
                          />
                        ))}
                      </div>
                      {/* Absence bars */}
                      {m.ausencias.map((a) => {
                        const bar = barFor(a)
                        if (!bar) return null
                        return (
                          <div
                            key={a.id}
                            className={`absolute top-1.5 bottom-1.5 rounded ${TIPO_COR[a.tipo].bar}`}
                            style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                            title={bar.title}
                          />
                        )
                      })}
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
    </div>
  )
}
