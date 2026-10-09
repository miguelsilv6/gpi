import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildAtividadePrazoWhere, buildControloWhere, buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { AccessDenied } from '@/components/access-denied'
import {
  ATIVIDADE_PRAZO_SELECT,
  endOfMonthExclusive,
  formatMonthParam,
  startOfMonth,
} from '@/lib/prazos'
import { CONTROLO_SELECT } from '@/lib/controlos'
import {
  afterCursorWhere,
  compareCursor,
  formatCursor,
  parseCursor,
  parseHistorico,
  type PrazoCursor,
} from '@/lib/prazos-cursor'
import { isModuloIntercecoesAtivo } from '@/lib/intercecoes-module'
import { TIPO_LINHA_LABEL } from '@/lib/validations/intercecao'
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
import { Download } from 'lucide-react'
import type { Role, TipoLinhaIntercecao } from '@/generated/prisma/enums'

interface SearchParams {
  view?: string
  status?: string
  inspetorId?: string
  page?: string
  /** Cursor (último item da página anterior) — só com interceções misturadas. */
  c?: string
  /** Histórico de cursores anteriores, para o botão "Anterior". */
  h?: string
  month?: string
  day?: string
  panel?: string
  historico?: string
}

function startOfDayLocal(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
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
  const userId = session.user.id
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

  // Quem não é INSPETOR vê interceções de outros inspetores — mostra de quem.
  const showInspetor = role !== 'INSPETOR'
  const showBrigada = false
  const canFilterInspetor = false
  const inspetores: { id: string; nome: string }[] = []

  let items: PrazoItem[] = []
  let total = 0
  let totalPages = 1
  // Cursor da página seguinte (null = última página); só no modo por cursor.
  let proximoCursor: string | null = null

  // Fim das linhas intercetadas dos inquéritos do utilizador (só pendentes:
  // uma linha cuja autorização terminou não tem "conclusão" a registar).
  const showIntercecoes = panel === 'prazos' && !historico && (await isModuloIntercecoesAtivo(role))
  const intercecaoDataFim =
    status === 'vencidos'
      ? { lt: now }
      : status === 'proximos'
        ? { gte: now, lte: limitProximos }
        : isCalendar && monthDate && monthEnd
          ? { gte: monthDate, lt: monthEnd }
          : { gte: startOfDayLocal(now) }
  const intercecaoWhere = {
    dataFim: intercecaoDataFim,
    // Segue o scope do inquérito (como o resto do módulo Interceções), não só
    // os do próprio utilizador. Composto via AND porque o scope do INSPETOR
    // devolve um `OR` no topo.
    alvo: {
      inquerito: {
        AND: [
          { deletedAt: null, estado: { terminal: false } },
          buildInqueritoWhere(role, userId, session.user.brigadaId ?? null),
        ],
      },
    },
  }
  const intercecaoSelect = {
    id: true,
    codigo: true,
    tipo: true,
    identificador: true,
    dataFim: true,
    alertaDias1: true,
    alertaDias2: true,
    alerta1Enviado: true,
    alerta2Enviado: true,
    alvo: {
      select: {
        nome: true,
        inquerito: {
          select: {
            ...ATIVIDADE_PRAZO_SELECT.inquerito.select,
            inspetor: { select: { id: true, nome: true } },
          },
        },
      },
    },
  } as const

  async function loadIntercecoes(
    take: number,
    cursor: PrazoCursor | null = null,
  ): Promise<{ items: PrazoItem[]; count: number }> {
    if (!showIntercecoes) return { items: [], count: 0 }
    const where =
      status !== 'todos' && isCalendar && monthDate && monthEnd
        ? { ...intercecaoWhere, AND: [{ dataFim: { gte: monthDate, lt: monthEnd } }] }
        : intercecaoWhere
    const [rows, count] = await Promise.all([
      prisma.intercecaoLinha.findMany({
        where: cursor ? { AND: [where, afterCursorWhere('dataFim', 1, cursor)] } : where,
        orderBy: [{ dataFim: 'asc' }, { id: 'asc' }],
        take,
        select: intercecaoSelect,
      }),
      prisma.intercecaoLinha.count({ where }),
    ])
    return {
      count,
      items: rows.map((l) => ({
        id: `intercecao-${l.id}`,
        origem: 'intercecao' as const,
        descricao: `Fim de interceção: ${TIPO_LINHA_LABEL[l.tipo as TipoLinhaIntercecao]} ${l.identificador} (alvo «${l.alvo.nome}», código ${l.codigo})`,
        quantidade: null,
        dataPrazo: l.dataFim,
        concluidaEm: null,
        alertaDias1: l.alertaDias1,
        alertaDias2: l.alertaDias2,
        alerta1Enviado: l.alerta1Enviado,
        alerta2Enviado: l.alerta2Enviado,
        realizadaPor: l.alvo.inquerito.inspetor ?? { id: userId, nome: '—' },
        inquerito: l.alvo.inquerito,
      })),
    }
  }

  const byDataPrazo = (a: PrazoItem, b: PrazoItem) =>
    new Date(a.dataPrazo).getTime() - new Date(b.dataPrazo).getTime()

  const cursor = showIntercecoes && !isCalendar ? parseCursor(sp.c) : null
  const historicoCursores = parseHistorico(sp.h)

  /** Posição de um item na ordem total (data, fonte, id) da lista. */
  function cursorOf(p: PrazoItem): PrazoCursor {
    const inter = p.origem === 'intercecao'
    return {
      date: new Date(p.dataPrazo),
      rank: inter ? 1 : 0,
      id: inter ? p.id.replace(/^intercecao-/, '') : p.id,
    }
  }

  if (panel === 'prazos') {
    if (isCalendar) {
      const [data, inter] = await Promise.all([
        prisma.atividade.findMany({
          where: prazosWhere,
          orderBy: { dataPrazo: 'asc' },
          take: CALENDAR_MAX,
          select: ATIVIDADE_PRAZO_SELECT,
        }),
        loadIntercecoes(CALENDAR_MAX),
      ])
      items = [
        ...data.filter((a): a is typeof a & { dataPrazo: Date } => a.dataPrazo !== null),
        ...inter.items,
      ].sort(byDataPrazo)
    } else {
      if (showIntercecoes) {
        // Paginação por cursor (keyset) sobre as duas fontes, ordenadas por
        // (data, fonte, id): cada fonte devolve no máximo PAGE_SIZE+1 itens
        // depois do cursor, independentemente da profundidade da página.
        const [data, count, inter] = await Promise.all([
          prisma.atividade.findMany({
            where: { AND: [prazosWhere, afterCursorWhere('dataPrazo', 0, cursor)] },
            orderBy: [{ dataPrazo: 'asc' }, { id: 'asc' }],
            take: PAGE_SIZE + 1,
            select: ATIVIDADE_PRAZO_SELECT,
          }),
          prisma.atividade.count({ where: prazosWhere }),
          loadIntercecoes(PAGE_SIZE + 1, cursor),
        ])
        const merged = [
          ...data.filter((a): a is typeof a & { dataPrazo: Date } => a.dataPrazo !== null),
          ...inter.items,
        ].sort((x, y) => compareCursor(cursorOf(x), cursorOf(y)))
        items = merged.slice(0, PAGE_SIZE)
        proximoCursor = merged.length > PAGE_SIZE ? formatCursor(cursorOf(items[PAGE_SIZE - 1])) : null
        total = count + inter.count
      } else {
        const [data, count] = await Promise.all([
          prisma.atividade.findMany({
            where: prazosWhere,
            orderBy: [prazosOrderBy, { id: 'asc' as const }],
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            select: ATIVIDADE_PRAZO_SELECT,
          }),
          prisma.atividade.count({ where: prazosWhere }),
        ])
        items = data.filter((a): a is typeof a & { dataPrazo: Date } => a.dataPrazo !== null)
        total = count
      }
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

  function baseParams(): URLSearchParams {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== 'page' && k !== 'c' && k !== 'h') params.set(k, String(v))
    }
    return params
  }

  // Por cursor: "Próxima" guarda o cursor atual no histórico; "Anterior" volta
  // ao último cursor guardado ('-' = primeira página).
  const usaCursor = showIntercecoes && !isCalendar
  const paginaAtual = usaCursor ? historicoCursores.length + 1 : page
  const temAnterior = usaCursor ? historicoCursores.length > 0 : page > 1
  const temProxima = usaCursor ? proximoCursor !== null : page < totalPages

  function urlAnterior(): string {
    const params = baseParams()
    if (usaCursor) {
      const hist = [...historicoCursores]
      const prev = hist.pop() ?? '-'
      if (prev !== '-') params.set('c', prev)
      if (hist.length > 0) params.set('h', hist.join('~'))
    } else {
      params.set('page', String(page - 1))
    }
    return `/prazos?${params.toString()}`
  }

  function urlProxima(): string {
    const params = baseParams()
    if (usaCursor && proximoCursor) {
      params.set('c', proximoCursor)
      params.set('h', [...historicoCursores, sp.c ?? '-'].join('~'))
    } else {
      params.set('page', String(page + 1))
    }
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
        {panel === 'prazos' && hasPermission(role, 'inquerito:export') && (
          <a
            href={`/api/prazos/export?${new URLSearchParams({
              ...(status !== 'todos' && { status }),
              ...(historico && { historico: '1' }),
            }).toString()}`}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </a>
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
              {(temAnterior || temProxima) && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Página {paginaAtual} de {Math.max(totalPages, paginaAtual)}
                  </span>
                  <div className="flex gap-2">
                    {temAnterior && (
                      <Link
                        href={urlAnterior()}
                        className="px-3 py-1.5 rounded-lg border hover:bg-accent transition-colors"
                      >
                        Anterior
                      </Link>
                    )}
                    {temProxima && (
                      <Link
                        href={urlProxima()}
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
