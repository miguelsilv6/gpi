'use client'

import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { ptBR } from 'date-fns/locale'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { countWorkingDays } from '@/lib/ferias'
import { getPortugueseHolidays } from '@/lib/ajudas-calc'
import type { Ausencia, TipoAusencia } from './types'
import { TIPO_LABEL } from './types'

interface Props {
  ausencias: Ausencia[]
  month: Date
  onMonthChange: (d: Date) => void
  onCreate: (payload: { tipo: TipoAusencia; dataInicio: string; dataFim: string; nota: string | null }) => Promise<boolean>
  busy?: boolean
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function fromKey(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/** Enumerate each calendar day in the inclusive ISO range. */
function enumerateDays(inicioISO: string, fimISO: string): Date[] {
  // ISO strings from the server are UTC — read the calendar day in UTC, then
  // build local dates for react-day-picker (which matches in local time).
  const start = new Date(inicioISO)
  const end = new Date(fimISO)
  const days: Date[] = []
  const cursor = new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const last = new Date(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  while (cursor <= last) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export function FeriasCalendar({ ausencias, month, onMonthChange, onCreate, busy }: Props) {
  const [range, setRange] = useState<DateRange | undefined>()
  const [tipo, setTipo] = useState<TipoAusencia>('FERIAS')
  const [nota, setNota] = useState('')

  const { feriadoDays, feriasDays, folgaDays } = useMemo(() => {
    const y = month.getFullYear()
    const holidaySet = new Set<string>()
    for (const yr of [y - 1, y, y + 1]) {
      for (const h of getPortugueseHolidays(yr)) holidaySet.add(h)
    }
    const feriado = Array.from(holidaySet).map(fromKey)

    const ferias: Date[] = []
    const folga: Date[] = []
    for (const a of ausencias) {
      const target = a.tipo === 'FERIAS' ? ferias : folga
      target.push(...enumerateDays(a.dataInicio, a.dataFim))
    }
    return { feriadoDays: feriado, feriasDays: ferias, folgaDays: folga }
  }, [ausencias, month])

  // react-day-picker gives local-midnight dates; countWorkingDays reads UTC fields.
  // Convert to UTC midnight to avoid off-by-one in UTC+1 (Portugal summer).
  const selectedCount =
    range?.from && range?.to
      ? countWorkingDays(
          new Date(Date.UTC(range.from.getFullYear(), range.from.getMonth(), range.from.getDate())),
          new Date(Date.UTC(range.to.getFullYear(), range.to.getMonth(), range.to.getDate())),
        )
      : 0
  const canConfirm = !!(range?.from && range?.to) && !busy

  async function confirm() {
    if (!range?.from || !range?.to) return
    const ok = await onCreate({
      tipo,
      dataInicio: toKey(range.from),
      dataFim: toKey(range.to),
      nota: nota.trim() || null,
    })
    if (!ok) return
    setRange(undefined)
    setNota('')
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center overflow-x-auto">
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
          month={month}
          onMonthChange={onMonthChange}
          locale={ptBR}
          className="md:[--cell-size:calc(var(--spacing)*12)]"
          modifiers={{ feriado: feriadoDays, feria: feriasDays, folga: folgaDays }}
          modifiersClassNames={{
            feriado:
              "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-orange-500 after:content-['']",
            feria:
              "relative before:absolute before:top-1 before:left-1/2 before:-translate-x-1/2 before:h-1 before:w-1 before:rounded-full before:bg-blue-500 before:content-['']",
            folga:
              "relative before:absolute before:top-1 before:left-1/2 before:-translate-x-1/2 before:h-1 before:w-1 before:rounded-full before:bg-amber-500 before:content-['']",
          }}
        />
      </div>

      <Legend />

      {range?.from && range?.to && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">
              {toKey(range.from)} → {toKey(range.to)}
            </span>
            <span className="text-sm font-medium tabular-nums">
              {selectedCount} dia{selectedCount === 1 ? '' : 's'} útei{selectedCount === 1 ? 'l' : 's'}
            </span>
          </div>

          <div className="flex gap-2">
            {(['FERIAS', 'FOLGA'] as TipoAusencia[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={
                  'flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ' +
                  (tipo === t ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')
                }
              >
                {TIPO_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ferias-nota" className="text-xs text-muted-foreground">Nota (opcional)</Label>
            <Textarea
              id="ferias-nota"
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Observação..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRange(undefined)} disabled={busy}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirm} disabled={!canConfirm}>
              Marcar {TIPO_LABEL[tipo]}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
      <Dot color="bg-blue-500" label="Férias" pos="top" />
      <Dot color="bg-amber-500" label="Folga" pos="top" />
      <Dot color="bg-orange-500" label="Feriado" pos="bottom" />
    </div>
  )
}

function Dot({ color, label }: { color: string; label: string; pos: 'top' | 'bottom' }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {label}
    </span>
  )
}
