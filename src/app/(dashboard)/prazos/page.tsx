import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildAtividadePrazoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { AccessDenied } from '@/components/access-denied'
import {
  ATIVIDADE_PRAZO_SELECT,
  endOfMonthExclusive,
  formatMonthParam,
  startOfMonth,
} from '@/lib/prazos'
import { PrazosViewToggle } from '@/components/prazos/prazos-view-toggle'
import { PrazosFilters } from '@/components/prazos/prazos-filters'
import { PrazosList } from '@/components/prazos/prazos-list'
import { PrazosCalendar } from '@/components/prazos/prazos-calendar'
import type { PrazoItem } from '@/components/prazos/types'
import Link from 'next/link'
import type { Role } from '@/generated/prisma/enums'

interface SearchParams {
  view?: string
  status?: string
  inspetorId?: string
  page?: string
  month?: string
  day?: string
}

const PAGE_SIZE = 50
const CALENDAR_MAX = 500

export default async function PrazosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'prazo:read:own')) {
    // Página exclusiva a roles operacionais. ESTATISTICA não tem acesso.
    return <AccessDenied message="Não dispões de privilégios para ver prazos." />
  }

  // Defensive: chefe sem brigada na sessão devolve sempre lista vazia.
  // Quase de certeza o JWT está stale — pedir relogin é a saída clara.
  if (role === 'INSPETOR_CHEFE' && !session.user.brigadaId) {
    return (
      <div className="space-y-3 max-w-xl">
        <h1 className="text-2xl font-bold tracking-tight">Prazos</h1>
        <p className="text-sm text-muted-foreground">
          A sua sessão não tem brigada associada. Termine a sessão e volte a entrar para
          carregar a brigada actualizada.
        </p>
      </div>
    )
  }

  const sp = await searchParams
  const view: 'list' | 'calendar' = sp.view === 'calendar' ? 'calendar' : 'list'
  const status = sp.status === 'vencidos' || sp.status === 'proximos' ? sp.status : 'todos'
  // `__mine__` is a sentinel that resolves to the current user — used by the
  // "Definidos por mim" option in the inspetor filter.
  const rawInspetorFilter = sp.inspetorId ?? ''
  const inspetorIdFilter =
    rawInspetorFilter === '__mine__' ? session.user.id : rawInspetorFilter
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  // Load the system alertaDias for "próximos" classification
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { prazoAlertaDias: true },
  })
  const alertaDias = config?.prazoAlertaDias ?? 7

  const now = new Date()
  const limitProximos = new Date(now)
  limitProximos.setDate(limitProximos.getDate() + alertaDias)

  // RBAC scope
  const scopeWhere = buildAtividadePrazoWhere(
    role,
    session.user.id,
    session.user.brigadaId,
  )

  // Status filter
  const statusWhere =
    status === 'vencidos'
      ? { dataPrazo: { lt: now } }
      : status === 'proximos'
        ? { dataPrazo: { gte: now, lte: limitProximos } }
        : {}

  // Inspetor filter (only meaningful for chefe+)
  const inspetorWhere =
    inspetorIdFilter && hasPermission(role, 'prazo:read:brigade')
      ? { utilizadorId: inspetorIdFilter }
      : {}

  // Calendar-view month bounds
  const isCalendar = view === 'calendar'
  const monthDate = isCalendar
    ? startOfMonth(sp.month ?? '') ??
      new Date(now.getFullYear(), now.getMonth(), 1)
    : null
  const monthEnd = isCalendar
    ? endOfMonthExclusive(formatMonthParam(monthDate!))!
    : null
  const calendarWhere =
    isCalendar && monthDate && monthEnd
      ? { dataPrazo: { gte: monthDate, lt: monthEnd } }
      : {}

  // Final where clause
  const where = {
    AND: [
      // Atividade has a deadline
      { dataPrazo: { not: null } },
      // Atividade still pending (operators can resolve a deadline via the
      // "Concluir" button on the inquérito detail; resolved atividades drop
      // out of /prazos and stop triggering cron alerts).
      { concluidaEm: null },
      // Inquérito is active (not soft-deleted, not in a terminal state)
      { inquerito: { deletedAt: null, estado: { terminal: false } } },
      scopeWhere,
      // status & calendar provide their own dataPrazo constraints
      statusWhere,
      inspetorWhere,
      calendarWhere,
    ],
  }

  const showInspetor = hasPermission(role, 'prazo:read:brigade')
  const showBrigada = hasPermission(role, 'prazo:read:all')
  const canFilterInspetor = showInspetor

  // Inspetor list for the filter dropdown
  // INSPETOR_CHEFE: utilizadores da sua brigada que criaram atividades nesta scope
  // COORDENADOR/ADMIN: all active inspetores
  const inspetores = canFilterInspetor
    ? await prisma.utilizador.findMany({
        where: {
          ativo: true,
          ...(role === 'INSPETOR_CHEFE'
            ? { brigadaId: session.user.brigadaId ?? '__no_brigada__' }
            : {}),
        },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true },
      })
    : []

  // List view: paginated; Calendar view: load full month
  // Note: the `dataPrazo: { not: null }` filter above guarantees no nulls, but
  // Prisma's generated type still includes `Date | null`. Narrow at the boundary.
  let items: PrazoItem[]
  let total = 0
  let totalPages = 1

  if (isCalendar) {
    const data = await prisma.atividade.findMany({
      where,
      orderBy: { dataPrazo: 'asc' },
      take: CALENDAR_MAX,
      select: ATIVIDADE_PRAZO_SELECT,
    })
    items = data.filter((a): a is typeof a & { dataPrazo: Date } => a.dataPrazo !== null)
  } else {
    const [data, count] = await Promise.all([
      prisma.atividade.findMany({
        where,
        orderBy: { dataPrazo: 'asc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: ATIVIDADE_PRAZO_SELECT,
      }),
      prisma.atividade.count({ where }),
    ])
    items = data.filter((a): a is typeof a & { dataPrazo: Date } => a.dataPrazo !== null)
    total = count
    totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  }

  // Build pagination URLs preserving filters
  function buildPageUrl(targetPage: number): string {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== 'page') params.set(k, String(v))
    }
    params.set('page', String(targetPage))
    return `/prazos?${params.toString()}`
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prazos</h1>
          <p className="text-muted-foreground text-sm">
            {isCalendar
              ? `Mês de ${monthDate?.toLocaleDateString('pt-PT', {
                  month: 'long',
                  year: 'numeric',
                })}`
              : `${total} prazo${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <PrazosViewToggle view={view} />
      </div>

      <Suspense fallback={null}>
        <PrazosFilters
          canFilterInspetor={canFilterInspetor}
          inspetores={inspetores}
          currentUserId={session.user.id}
        />
      </Suspense>

      {isCalendar ? (
        <PrazosCalendar
          items={items}
          month={monthDate!}
          day={sp.day ? new Date(`${sp.day}T00:00:00`) : null}
          showInspetor={showInspetor}
          showBrigada={showBrigada}
          alertaDias={alertaDias}
        />
      ) : (
        <>
          <PrazosList
            items={items}
            showInspetor={showInspetor}
            showBrigada={showBrigada}
            alertaDias={alertaDias}
            emptyMessage="Sem prazos por cumprir."
          />

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={buildPageUrl(page - 1)}
                    className="px-3 py-1.5 rounded-lg border hover:bg-accent transition-colors"
                  >
                    Anterior
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={buildPageUrl(page + 1)}
                    className="px-3 py-1.5 rounded-lg border hover:bg-accent transition-colors"
                  >
                    Próxima
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
