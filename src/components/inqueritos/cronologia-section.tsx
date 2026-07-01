import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  groupEventsByDay,
  type TimelineEvent,
  type TimelineEventTipo,
} from '@/lib/inquerito-timeline'
import { formatDate, formatTime, cn } from '@/lib/utils'
import {
  Clock,
  FolderPlus,
  History,
  ClipboardList,
  StickyNote,
  Paperclip,
  SquareCheck,
  Gavel,
  type LucideIcon,
} from 'lucide-react'

/**
 * Cronologia unificada do inquérito — server component estático (sem JS de
 * cliente): os eventos chegam já intercalados/ordenados de
 * `mergeTimelineEvents`. Para inquéritos longos, mostra os primeiros
 * INITIAL_DAYS dias e esconde o resto num <details> nativo.
 */

const TIPO_META: Record<TimelineEventTipo, { label: string; icon: LucideIcon; dot: string }> = {
  abertura: { label: 'Abertura', icon: FolderPlus, dot: 'bg-green-500' },
  estado: { label: 'Estado', icon: History, dot: 'bg-orange-500' },
  atividade: { label: 'Atividade', icon: ClipboardList, dot: 'bg-blue-500' },
  nota: { label: 'Nota', icon: StickyNote, dot: 'bg-yellow-500' },
  documento: { label: 'Documento', icon: Paperclip, dot: 'bg-slate-500' },
  tarefa: { label: 'Tarefa', icon: SquareCheck, dot: 'bg-teal-500' },
  diligencia: { label: 'Diligência', icon: Gavel, dot: 'bg-violet-500' },
}

const INITIAL_DAYS = 10

function horaOf(ev: TimelineEvent): string | null {
  // O dia está no cabeçalho do grupo — aqui só a hora.
  if (ev.dateOnly) return null
  return formatTime(ev.at)
}

function DayGroup({ day, events }: { day: string; events: TimelineEvent[] }) {
  return (
    <li>
      <p className="text-xs font-medium text-muted-foreground mb-2">
        {formatDate(new Date(`${day}T00:00:00`))}
      </p>
      <ol className="space-y-2.5 border-l border-border pl-4 ml-1">
        {events.map((ev) => {
          const meta = TIPO_META[ev.tipo]
          const Icon = meta.icon
          const hora = horaOf(ev)
          return (
            <li key={ev.key} className="relative text-sm">
              <span
                className={cn(
                  'absolute -left-[21px] top-1.5 h-2 w-2 rounded-full',
                  meta.dot,
                )}
                aria-hidden
              />
              <div className="flex items-start gap-2 min-w-0">
                <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium break-words">{ev.titulo}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {meta.label}
                      {hora ? ` · ${hora}` : ''}
                    </span>
                  </div>
                  {(ev.detalhe || ev.autorNome) && (
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">
                      {ev.detalhe}
                      {ev.detalhe && ev.autorNome ? ' — ' : ''}
                      {ev.autorNome ? `por ${ev.autorNome}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </li>
  )
}

export function CronologiaSection({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null
  const groups = groupEventsByDay(events)
  const visiveis = groups.slice(0, INITIAL_DAYS)
  const restantes = groups.slice(INITIAL_DAYS)
  const restantesEventos = restantes.reduce((n, g) => n + g.events.length, 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          Cronologia
          <span className="font-normal">
            · {events.length} {events.length === 1 ? 'evento' : 'eventos'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {visiveis.map((g) => (
            <DayGroup key={g.day} day={g.day} events={g.events} />
          ))}
        </ol>
        {restantes.length > 0 && (
          <details className="mt-4 group">
            <summary className="cursor-pointer text-sm text-primary hover:underline list-none">
              <span className="group-open:hidden">
                Mostrar mais {restantesEventos} {restantesEventos === 1 ? 'evento' : 'eventos'} (
                {restantes.length} {restantes.length === 1 ? 'dia' : 'dias'})
              </span>
              <span className="hidden group-open:inline">Mostrar menos</span>
            </summary>
            <ol className="space-y-4 mt-4">
              {restantes.map((g) => (
                <DayGroup key={g.day} day={g.day} events={g.events} />
              ))}
            </ol>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
