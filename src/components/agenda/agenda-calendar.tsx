'use client'

import React, { useMemo, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ptBR } from 'date-fns/locale'
import {
  FolderOpen,
  ClipboardList,
  Repeat,
  Gavel,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ExternalLink,
  MapPin,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatMonthParam, formatDayParam } from '@/lib/prazos'
import type { AgendaEvent, AgendaEventTipo } from '@/lib/agenda'
import { TIPO_DILIGENCIA_LABEL, TIPO_DILIGENCIA_BADGE } from '@/lib/validations/diligencia'
import type { TipoDiligencia } from '@/generated/prisma/enums'
import { DiligenciaDialog } from './diligencia-dialog'

interface Props {
  events: AgendaEvent[]
  month: Date
  day: Date | null
  canCreate: boolean
  isAdmin: boolean
  currentUserId: string
}

const TIPO_META: Record<AgendaEventTipo, { label: string; icon: typeof FolderOpen; dot: string }> = {
  diligencia: { label: 'Diligência', icon: Gavel, dot: 'after:bg-violet-500' },
  inquerito: { label: 'Prazo de inquérito', icon: FolderOpen, dot: 'after:bg-orange-500' },
  atividade: { label: 'Atividade', icon: ClipboardList, dot: 'after:bg-blue-500' },
  controlo: { label: 'Controlo', icon: Repeat, dot: 'after:bg-teal-500' },
}

// Prioridade de cor do ponto no dia (a mais alta presente vence).
const PRIORIDADE: AgendaEventTipo[] = ['diligencia', 'inquerito', 'atividade', 'controlo']

function dayKey(iso: string): string {
  return formatDayParam(new Date(iso))
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = d.getHours()
  const mm = d.getMinutes()
  if (hh === 0 && mm === 0) return ''
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function AgendaCalendar({ events, month, day, canCreate, isAdmin, currentUserId }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AgendaEvent | null>(null)
  const [toDelete, setToDelete] = useState<AgendaEvent | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { byDay, modifierDays } = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>()
    for (const ev of events) {
      const k = dayKey(ev.data)
      const list = map.get(k) ?? []
      list.push(ev)
      map.set(k, list)
    }
    const days: Record<AgendaEventTipo, Date[]> = {
      diligencia: [],
      inquerito: [],
      atividade: [],
      controlo: [],
    }
    for (const [k, list] of map.entries()) {
      const present = new Set(list.map((e) => e.tipo))
      const winner = PRIORIDADE.find((t) => present.has(t)) ?? 'controlo'
      days[winner].push(new Date(`${k}T00:00:00`))
    }
    return { byDay: map, modifierDays: days }
  }, [events])

  function pushParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const visible = day ? byDay.get(formatDayParam(day)) ?? [] : events

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }
  function openEdit(ev: AgendaEvent) {
    setEditing(ev)
    setDialogOpen(true)
  }

  async function confirmDelete() {
    if (!toDelete?.diligenciaId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/diligencias/${toDelete.diligenciaId}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao eliminar a diligência')
        return
      }
      toast.success('Diligência eliminada')
      setToDelete(null)
      router.refresh()
    } catch {
      toast.error('Erro de rede ao eliminar a diligência')
    } finally {
      setDeleting(false)
    }
  }

  const podeGerir = (ev: AgendaEvent) =>
    ev.tipo === 'diligencia' && (isAdmin || ev.criadoPorId === currentUserId)

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            Nova diligência
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="flex justify-center py-4 overflow-x-auto">
          <Calendar
            mode="single"
            selected={day ?? undefined}
            month={month}
            onSelect={(d) => pushParams({ day: d ? formatDayParam(d) : null })}
            onMonthChange={(next) => pushParams({ month: formatMonthParam(next), day: null })}
            locale={ptBR}
            style={{ '--cell-size': 'calc(var(--spacing) * 12)' } as React.CSSProperties}
            modifiers={{
              diligencia: modifierDays.diligencia,
              inquerito: modifierDays.inquerito,
              atividade: modifierDays.atividade,
              controlo: modifierDays.controlo,
            }}
            modifiersClassNames={{
              diligencia: dotClass('after:bg-violet-500'),
              inquerito: dotClass('after:bg-orange-500'),
              atividade: dotClass('after:bg-blue-500'),
              controlo: dotClass('after:bg-teal-500'),
            }}
          />
        </CardContent>
      </Card>

      <Legend />

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {day
            ? day.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })
            : 'Todo o mês'}
        </p>
        {day && (
          <button
            type="button"
            onClick={() => pushParams({ day: null })}
            className="text-xs text-blue-600 hover:underline"
          >
            Ver todo o mês
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {day ? 'Sem eventos neste dia.' : 'Sem eventos neste mês.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((ev) => {
            const meta = TIPO_META[ev.tipo]
            const Icon = meta.icon
            const time = formatTime(ev.data)
            return (
              <li
                key={ev.id}
                className={`rounded-lg border px-3 py-2 ${ev.concluido ? 'bg-muted/10 opacity-70' : 'bg-muted/20'}`}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${ev.concluido ? 'line-through text-muted-foreground' : ''}`}>
                        {ev.titulo}
                      </span>
                      {ev.tipo === 'diligencia' && ev.subtipo ? (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TIPO_DILIGENCIA_BADGE[ev.subtipo as TipoDiligencia]}`}>
                          {TIPO_DILIGENCIA_LABEL[ev.subtipo as TipoDiligencia]}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{meta.label}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-0.5">
                      {time && <span className="tabular-nums">{time}</span>}
                      {ev.local && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {ev.local}
                        </span>
                      )}
                      {ev.nuipc && ev.slug && (
                        <Link href={`/inqueritos/${ev.slug}`} className="inline-flex items-center gap-1 font-mono hover:underline">
                          {ev.nuipc}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                    {ev.observacoes && (
                      <p className="text-xs mt-1 whitespace-pre-wrap">{ev.observacoes}</p>
                    )}
                  </div>
                  {podeGerir(ev) && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar" onClick={() => openEdit(ev)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        title="Eliminar"
                        onClick={() => setToDelete(ev)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <DiligenciaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existing={editing}
        defaultDay={day}
      />

      <Dialog open={!!toDelete} onOpenChange={(v) => { if (!v) setToDelete(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Eliminar diligência?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {toDelete?.titulo}. Esta ação é permanente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function dotClass(bg: string): string {
  return `relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full ${bg} after:content-['']`
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <Dot color="bg-violet-500" label="Diligência" />
      <Dot color="bg-orange-500" label="Prazo de inquérito" />
      <Dot color="bg-blue-500" label="Atividade" />
      <Dot color="bg-teal-500" label="Controlo" />
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
