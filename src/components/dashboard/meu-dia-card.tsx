import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PRIORIDADE_LABEL, PRIORIDADE_COLOR } from '@/components/tarefas/tarefa-shared'
import type { MeuDiaData } from '@/lib/meu-dia'
import type { AgendaEvent, AgendaEventTipo } from '@/lib/agenda'
import { cn, formatTime } from '@/lib/utils'
import {
  Sun,
  AlertTriangle,
  FolderOpen,
  ClipboardList,
  Repeat,
  Gavel,
  SquareCheck,
  type LucideIcon,
} from 'lucide-react'

/**
 * "O meu dia" — bloco do dashboard com os eventos de hoje/amanhã (mesma
 * semântica e âmbito da Agenda), tarefas pessoais em aberto e um aviso de
 * atrasados. Server component estático.
 */

const TIPO_META: Record<AgendaEventTipo, { label: string; icon: LucideIcon }> = {
  inquerito: { label: 'Prazo', icon: FolderOpen },
  atividade: { label: 'Atividade', icon: ClipboardList },
  controlo: { label: 'Controlo', icon: Repeat },
  diligencia: { label: 'Diligência', icon: Gavel },
}

function horaOf(ev: AgendaEvent): string | null {
  // Só as diligências têm hora marcada com significado; prazos/atividades/
  // controlos são datas de calendário. Meia-noite exata = "sem hora marcada"
  // (mesma convenção da Agenda).
  if (ev.tipo !== 'diligencia') return null
  const hora = formatTime(ev.data)
  return hora === '00:00' ? null : hora
}

function EventRow({ ev }: { ev: AgendaEvent }) {
  const meta = TIPO_META[ev.tipo]
  const Icon = meta.icon
  const hora = horaOf(ev)
  const inner = (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className={cn('text-sm break-words', ev.concluido && 'line-through text-muted-foreground')}>
          {ev.titulo}
        </p>
        <p className="text-xs text-muted-foreground">
          {meta.label}
          {hora ? ` · ${hora}` : ''}
          {ev.nuipc ? ` · ${ev.nuipc}` : ''}
        </p>
      </div>
    </div>
  )
  return ev.slug ? (
    <Link href={`/inqueritos/${ev.slug}`} className="block rounded-md -mx-1 px-1 py-0.5 hover:bg-accent transition-colors">
      {inner}
    </Link>
  ) : (
    <div className="py-0.5">{inner}</div>
  )
}

function EventList({ titulo, eventos, vazio }: { titulo: string; eventos: AgendaEvent[]; vazio: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{titulo}</p>
      {eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <div className="space-y-2">
          {eventos.map((ev) => (
            <EventRow key={ev.id} ev={ev} />
          ))}
        </div>
      )}
    </div>
  )
}

export function MeuDiaCard({ dia }: { dia: MeuDiaData }) {
  const totalAtrasados = dia.atrasados.prazos + dia.atrasados.atividades + dia.atrasados.controlos
  const atrasadosPartes = [
    dia.atrasados.prazos > 0 && `${dia.atrasados.prazos} ${dia.atrasados.prazos === 1 ? 'prazo vencido' : 'prazos vencidos'}`,
    dia.atrasados.atividades > 0 && `${dia.atrasados.atividades} ${dia.atrasados.atividades === 1 ? 'atividade em atraso' : 'atividades em atraso'}`,
    dia.atrasados.controlos > 0 && `${dia.atrasados.controlos} ${dia.atrasados.controlos === 1 ? 'controlo em atraso' : 'controlos em atraso'}`,
  ].filter(Boolean)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-1.5">
          <Sun className="h-4 w-4 text-amber-500" />
          O meu dia
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {totalAtrasados > 0 && (
          <Link
            href="/prazos"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 hover:bg-red-100 transition-colors dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50"
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{atrasadosPartes.join(' · ')} — ver em Prazos e Controlos</span>
          </Link>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <EventList titulo="Hoje" eventos={dia.hoje} vazio="Sem eventos para hoje." />
          <EventList titulo="Amanhã" eventos={dia.amanha} vazio="Sem eventos para amanhã." />
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Tarefas em aberto
              {dia.tarefasTotal > 0 && ` (${dia.tarefasTotal})`}
            </p>
            {dia.tarefas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem tarefas pendentes.</p>
            ) : (
              <div className="space-y-2">
                {dia.tarefas.map((t) => (
                  <Link
                    key={t.id}
                    href={`/inqueritos/${t.slug}`}
                    className="block rounded-md -mx-1 px-1 py-0.5 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <SquareCheck className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm break-words">{t.titulo}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Badge className={cn('px-1.5 py-0 text-[10px]', PRIORIDADE_COLOR[t.prioridade])}>
                            {PRIORIDADE_LABEL[t.prioridade]}
                          </Badge>
                          {t.nuipc}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
                {dia.tarefasTotal > dia.tarefas.length && (
                  <Link href="/tarefas" className="block text-xs text-primary hover:underline">
                    Ver todas as tarefas →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
