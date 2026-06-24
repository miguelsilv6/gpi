import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/rbac'
import { isModuloAgendaAtivo } from '@/lib/agenda-module'
import { AccessDenied } from '@/components/access-denied'
import { getAgendaEvents } from '@/lib/agenda'
import { startOfMonth, endOfMonthExclusive, formatMonthParam } from '@/lib/prazos'
import { AgendaCalendar } from '@/components/agenda/agenda-calendar'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import type { Role } from '@/generated/prisma/enums'

export const dynamic = 'force-dynamic'

interface SearchParams {
  month?: string
  day?: string
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!(await isModuloAgendaAtivo(role))) {
    return <AccessDenied message="O módulo Agenda está desativado ou não tens acesso." />
  }

  const sp = await searchParams
  const now = new Date()
  const monthDate =
    startOfMonth(sp.month ?? '') ?? new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = endOfMonthExclusive(formatMonthParam(monthDate))!

  const events = await getAgendaEvents(
    role,
    session.user.id,
    session.user.brigadaId ?? null,
    monthDate,
    monthEnd,
  )

  const day =
    sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? new Date(`${sp.day}T00:00:00`) : null
  const canCreate = role !== 'ESTATISTICA'
  const isAdmin = hasPermission(role, 'inquerito:edit:all')

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground text-sm">
            {monthDate.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <HelpButton title="Ajuda — Agenda" className="shrink-0">
          <HelpSection title="O que vê aqui">
            <p>Vista de calendário que reúne, no mesmo sítio, os prazos de inquérito, as suas atividades com prazo, os controlos e as diligências (datas de tribunal, buscas, inquirições…).</p>
          </HelpSection>
          <HelpSection title="Diligências">
            <p>Use <strong>Nova diligência</strong> para marcar um julgamento, inquirição, busca, etc., opcionalmente ligado a um inquérito. Pode editar ou eliminar as diligências que criou.</p>
          </HelpSection>
          <HelpSection title="Navegação">
            <p>Mude de mês com as setas do calendário e clique num dia para ver apenas os eventos desse dia.</p>
          </HelpSection>
        </HelpButton>
      </div>

      <AgendaCalendar
        events={events}
        month={monthDate}
        day={day}
        canCreate={canCreate}
        isAdmin={isAdmin}
        currentUserId={session.user.id}
      />
    </div>
  )
}
