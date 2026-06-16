import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildAtividadePrazoWhere, buildControloWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { AccessDenied } from '@/components/access-denied'
import {
  ATIVIDADE_PRAZO_SELECT,
  endOfMonthExclusive,
  formatMonthParam,
  startOfMonth,
} from '@/lib/prazos'
import { CONTROLO_SELECT } from '@/lib/controlos'
import { PrazosViewToggle } from '@/components/prazos/prazos-view-toggle'
import { PrazosFilters } from '@/components/prazos/prazos-filters'
import { PrazosList } from '@/components/prazos/prazos-list'
import { PrazosCalendar } from '@/components/prazos/prazos-calendar'
import { ControlosList } from '@/components/prazos/controlos-list'
import { ControlosCalendar } from '@/components/prazos/controlos-calendar'
import { CreateControloDialog } from '@/components/prazos/create-controlo-dialog'
import { PanelTabs } from '@/components/prazos/panel-tabs'
import { HistoricoToggle } from '@/components/prazos/historico-toggle'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import type { PrazoItem } from '@/components/prazos/types'
import type { ControloItem } from '@/lib/controlos'
import Link from 'next/link'
import type { Role } from '@/generated/prisma/enums'

interface SearchParams {
  view?: string
  status?: string
  inspetorId?: string
  page?: string
  month?: string
  day?: string
  panel?: string
  historico?: string
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
    return <AccessDenied message="Não dispões de privilégios para ver prazos." />
  }

  const sp = await searchParams

  // Panel: 'prazos' (default) | 'controlos'
  const hasControloAccess = hasPermission(role, 'controlo:read:own')
  const panel = sp.panel === 'controlos' && hasControloAccess ? 'controlos' : 'prazos'
  // Histórico: mostra itens já concluídos em vez dos pendentes.
  const historico = sp.historico === '1'

  const view: 'list' | 'calendar' = sp.view === 'calendar' ? 'calendar' : 'list'
  const status = sp.status === 'vencidos' || sp.status === 'proximos' ? sp.status : 'todos'
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { prazoAlertaDias: true },
  })
  const alertaDias = config?.prazoAlertaDias ?? 7

  const now = new Date()

  // ─── Prazos panel data ────────────────────────────────────────────────────

  const limitProximos = new Date(now)
  limitProximos.setDate(limitProximos.getDate() + alertaDias)

  const scopeWhere = buildAtividadePrazoWhere(
    role,
    session.user.id,
    session.user.brigadaId,
  )

  const statusWhere =
    status === 'vencidos'
      ? { dataPrazo: { lt: now } }
      : status === 'proximos'
        ? { dataPrazo: { gte: now, lte: limitProximos } }
        : {}

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

  // No histórico mostram-se atividades já concluídas; relaxa-se o filtro de
  // estado terminal (um inquérito arquivado pode ter prazos concluídos a consultar).
  const concluidaWhere = historico ? { concluidaEm: { not: null } } : { concluidaEm: null }
  const inqueritoWhere = historico
    ? { inquerito: { deletedAt: null } }
    : { inquerito: { deletedAt: null, estado: { terminal: false } } }
  const prazosOrderBy = historico
    ? { concluidaEm: 'desc' as const }
    : { dataPrazo: 'asc' as const }

  const prazosWhere = {
    AND: [
      { dataPrazo: { not: null } },
      concluidaWhere,
      inqueritoWhere,
      scopeWhere,
      statusWhere,
      calendarWhere,
    ],
  }

  const showInspetor = false
  const showBrigada = false
  const canFilterInspetor = false
  const inspetores: { id: string; nome: string }[] = []

  let items: PrazoItem[] = []
  let total = 0
  let totalPages = 1

  if (panel === 'prazos') {
    if (isCalendar) {
      const data = await prisma.atividade.findMany({
        where: prazosWhere,
        orderBy: { dataPrazo: 'asc' },
        take: CALENDAR_MAX,
        select: ATIVIDADE_PRAZO_SELECT,
      })
      items = data.filter((a): a is typeof a & { dataPrazo: Date } => a.dataPrazo !== null)
    } else {
      const [data, count] = await Promise.all([
        prisma.atividade.findMany({
          where: prazosWhere,
          orderBy: prazosOrderBy,
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: ATIVIDADE_PRAZO_SELECT,
        }),
        prisma.atividade.count({ where: prazosWhere }),
      ])
      items = data.filter((a): a is typeof a & { dataPrazo: Date } => a.dataPrazo !== null)
      total = count
      totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    }
  }

  // ─── Controlos panel data ─────────────────────────────────────────────────

  const controloScopeWhere = buildControloWhere(
    role,
    session.user.id,
    session.user.brigadaId ?? null,
  )

  const controloConcluidoWhere = historico ? { concluidoEm: { not: null } } : { concluidoEm: null }
  const controlosOrderBy = historico
    ? { concluidoEm: 'desc' as const }
    : { dataInicio: 'asc' as const }

  // In calendar mode filter by the month of the next pending (or last completed) realizacao.
  const controlosCalendarWhere =
    isCalendar && monthDate && monthEnd
      ? historico
        ? { realizacoes: { some: { dataRealizacao: { not: null }, dataEsperada: { gte: monthDate, lt: monthEnd } } } }
        : { realizacoes: { some: { dataRealizacao: null, dataEsperada: { gte: monthDate, lt: monthEnd } } } }
      : {}

  const [controlosData, controlosTotal] = hasControloAccess && panel === 'controlos'
    ? await prisma.$transaction([
        prisma.controlo.findMany({
          where: { AND: [controloScopeWhere, controloConcluidoWhere, controlosCalendarWhere] },
          orderBy: controlosOrderBy,
          take: isCalendar ? CALENDAR_MAX : PAGE_SIZE,
          select: CONTROLO_SELECT,
        }),
        prisma.controlo.count({
          where: { AND: [controloScopeWhere, controloConcluidoWhere, controlosCalendarWhere] },
        }),
      ])
    : [[], 0]

  const showCriador = false
  const showBrigadaControlos = false

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
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Prazos e Controlos</h1>
          <p className="text-muted-foreground text-sm">
            {isCalendar
              ? `Mês de ${monthDate?.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}`
              : panel === 'controlos'
                ? `${controlosTotal} controlo${controlosTotal !== 1 ? 's' : ''} ${historico ? 'concluído' : 'pendente'}${controlosTotal !== 1 ? 's' : ''}`
                : `${total} prazo${total !== 1 ? 's' : ''}${historico ? ' concluído' + (total !== 1 ? 's' : '') : ''}`}
          </p>
        </div>
        <HelpButton title="Ajuda — Prazos e Controlos" className="shrink-0">
          <HelpSection title="Painéis: Prazos e Controlos">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Prazos</strong> — atividades com uma data-limite definida. Aparece o ícone <span className="text-red-500 font-medium">⚠</span> quando a data já passou.</li>
              <li><strong>Controlos</strong> — atividades periódicas (ex.: controlo mensal). Cada realização é registada individualmente.</li>
            </ul>
          </HelpSection>
          <HelpSection title="Pendentes / Concluídos">
            <p>O toggle <strong>Pendentes / Concluídos</strong> alterna entre prazos por cumprir e o histórico de prazos já concluídos.</p>
          </HelpSection>
          <HelpSection title="Vistas: Lista e Calendário">
            <p>Use os botões <strong>Lista</strong> e <strong>Calendário</strong> para alternar entre a vista em lista e a vista mensal de calendário.</p>
          </HelpSection>
          <HelpSection title="Filtros">
            <p>Pode filtrar por inspetor (se tiver permissão de brigada) e por estado: <em>Todos</em>, <em>Vencidos</em> ou <em>Próximos</em> (dentro do período de alerta configurado).</p>
          </HelpSection>
          <HelpSection title="Novo Controlo">
            <p>O botão <strong>Novo Controlo</strong> cria um controlo periódico numa atividade. Defina a atividade, o período em dias e o número de alertas antecipados.</p>
          </HelpSection>
        </HelpButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <HistoricoToggle historico={historico} />
        <PrazosViewToggle view={view} />
        {panel === 'controlos' && hasControloAccess && !historico && (
          <CreateControloDialog />
        )}
      </div>

      {hasControloAccess && (
        <PanelTabs panel={panel} />
      )}

      {panel === 'prazos' ? (
        <>
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
              day={sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? new Date(`${sp.day}T00:00:00`) : null}
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
                emptyMessage={historico ? 'Sem prazos concluídos.' : 'Sem prazos por cumprir.'}
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
        </>
      ) : isCalendar ? (
        <ControlosCalendar
          items={controlosData as unknown as ControloItem[]}
          month={monthDate!}
          day={sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? new Date(`${sp.day}T00:00:00`) : null}
          showCriador={showCriador}
          showBrigada={showBrigadaControlos}
        />
      ) : (
        <ControlosList
          items={controlosData as unknown as ControloItem[]}
          total={controlosTotal}
          showCriador={showCriador}
          showBrigada={showBrigadaControlos}
          emptyMessage={historico ? 'Sem controlos concluídos.' : 'Sem controlos pendentes.'}
        />
      )}
    </div>
  )
}
