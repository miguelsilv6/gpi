'use client'

import React, { useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { ControlosList } from './controlos-list'
import { ptBR } from 'date-fns/locale'
import type { ControloItem } from '@/lib/controlos'
import { urgencyControlo, nextRealizacao } from '@/lib/controlos'
import { formatMonthParam, formatDayParam } from '@/lib/prazos'

interface Props {
  items: ControloItem[]
  month: Date
  day: Date | null
  showCriador: boolean
  showBrigada: boolean
}

function dayKey(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d
  return formatDayParam(x)
}

export function ControlosCalendar({ items, month, day, showCriador, showBrigada }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const { byDay, overdueDays, urgentDays, soonDays, okDays } = useMemo(() => {
    const map = new Map<string, ControloItem[]>()
    for (const item of items) {
      const next = nextRealizacao(item.realizacoes)
      const dateVal = next?.dataEsperada ?? item.dataInicio
      const k = dayKey(dateVal)
      const list = map.get(k) ?? []
      list.push(item)
      map.set(k, list)
    }

    const overdue: Date[] = []
    const urgent: Date[] = []
    const soon: Date[] = []
    const ok: Date[] = []

    for (const [k, list] of map.entries()) {
      let worst: 'overdue' | 'urgent' | 'soon' | 'ok' = 'ok'
      const order = { overdue: 0, urgent: 1, soon: 2, ok: 3 } as const
      for (const item of list) {
        const next = nextRealizacao(item.realizacoes)
        const u = urgencyControlo(item, next)
        if (order[u] < order[worst]) worst = u
      }
      const date = new Date(`${k}T00:00:00`)
      if (worst === 'overdue') overdue.push(date)
      else if (worst === 'urgent') urgent.push(date)
      else if (worst === 'soon') soon.push(date)
      else ok.push(date)
    }

    return { byDay: map, overdueDays: overdue, urgentDays: urgent, soonDays: soon, okDays: ok }
  }, [items])

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  function onSelect(date: Date | undefined) {
    if (!date) { pushParams({ day: null }); return }
    pushParams({ day: formatDayParam(date) })
  }

  function onMonthChange(next: Date) {
    pushParams({ month: formatMonthParam(next), day: null })
  }

  const visibleItems = day ? (byDay.get(formatDayParam(day)) ?? []) : items
  const sortedVisible = [...visibleItems].sort((a, b) => {
    const nextA = nextRealizacao(a.realizacoes)
    const nextB = nextRealizacao(b.realizacoes)
    const dateA = nextA?.dataEsperada ?? a.dataInicio
    const dateB = nextB?.dataEsperada ?? b.dataInicio
    return new Date(dateA).getTime() - new Date(dateB).getTime()
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex justify-center py-4 overflow-x-auto">
          <Calendar
            mode="single"
            selected={day ?? undefined}
            month={month}
            onSelect={onSelect}
            onMonthChange={onMonthChange}
            locale={ptBR}
            style={{ '--cell-size': 'calc(var(--spacing) * 12)' } as React.CSSProperties}
            modifiers={{
              overdue: overdueDays,
              urgent: urgentDays,
              soon: soonDays,
              ok: okDays,
            }}
            modifiersClassNames={{
              overdue:
                "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-red-500 after:content-['']",
              urgent:
                "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-orange-500 after:content-['']",
              soon:
                "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-yellow-500 after:content-['']",
              ok:
                "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-blue-500 after:content-['']",
            }}
          />
        </CardContent>
      </Card>

      <Legend />

      <ControlosList
        items={sortedVisible}
        showCriador={showCriador}
        showBrigada={showBrigada}
        emptyMessage={day ? 'Sem controlos neste dia.' : 'Sem controlos neste mês.'}
      />
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <Dot color="bg-red-500" label="Vencido" />
      <Dot color="bg-orange-500" label="Urgente" />
      <Dot color="bg-yellow-500" label="Próximo" />
      <Dot color="bg-blue-500" label="Distante" />
    </div>
  )
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {label}
    </span>
  )
}
