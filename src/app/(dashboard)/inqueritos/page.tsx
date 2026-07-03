import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere, getInqueritoColumnsVisibility } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { Button } from '@/components/ui/button'
import { InqueritoFilters } from '@/components/inqueritos/inquerito-filters'
import { InqueritoTable } from '@/components/inqueritos/inquerito-table'
import { ExportButton } from '@/components/inqueritos/export-button'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { Plus, Upload, Columns3 } from 'lucide-react'
import Link from 'next/link'
import { listEstados } from '@/lib/estados'
import { listEtiquetasEmUso } from '@/lib/etiquetas'
import type { Role } from '@/generated/prisma/enums'
import { PageSizeSelect } from '@/components/inqueritos/page-size-select'
import { normalizeInqueritoPageSize, DEFAULT_INQUERITO_PAGE_SIZE } from '@/lib/pagination'

interface SearchParams {
  // Index signature: os parâmetros de pesquisa são todos `string | undefined`,
  // o que permite passar o objeto tal-e-qual ao seletor de página (client).
  [key: string]: string | undefined
  page?: string
  perPage?: string
  search?: string
  estado?: string
  crimeId?: string
  brigadaId?: string
  inspetorId?: string
  etiquetaId?: string
  overdue?: string
  semInspetor?: string
  cartaPrecatoria?: string
  dataAberturaFrom?: string
  dataAberturaTo?: string
  sort?: string
  order?: string
}

const ALLOWED_SORT: Record<string, true> = {
  updatedAt: true,
  dataAbertura: true,
  dataPrazo: true,
  nuipc: true,
  estado: true,
}

export default async function InqueritosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sp = await searchParams
  const role = session.user.role as Role
  const page = Math.max(1, parseInt(sp.page ?? '1'))

  const sort = sp.sort && ALLOWED_SORT[sp.sort] ? sp.sort : 'updatedAt'
  const order = sp.order === 'asc' ? 'asc' : 'desc'
  // Trim para não correr queries `contains` com espaços (ex.: "% %"), que
  // seriam caras e sem valor; vazio após trim = sem filtro de pesquisa.
  const search = sp.search?.trim()

  // Default aplicado ao filtro de estados quando o URL não tem `estado`
  // (visita inicial). O default pessoal do utilizador (perfil) tem prioridade;
  // se este estiver vazio, recai no default global do sistema. Sentinela
  // `__none__` significa que o utilizador escolheu explicitamente "sem filtro".
  const [config, currentUser] = await Promise.all([
    prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { inqueritoFiltroEstadosDefault: true },
    }),
    prisma.utilizador.findUnique({
      where: { id: session.user.id },
      select: { inqueritoFiltroEstadosDefault: true, inqueritoPageSizeDefault: true },
    }),
  ])
  const estadosDefaultUtilizador = currentUser?.inqueritoFiltroEstadosDefault ?? []
  const estadosDefault =
    estadosDefaultUtilizador.length > 0
      ? estadosDefaultUtilizador
      : config?.inqueritoFiltroEstadosDefault ?? []

  // Tamanho de página: `?perPage=` (seletor) tem prioridade; senão o default do
  // perfil do utilizador; senão o default do sistema. Valores fora do conjunto
  // permitido (20/50/100/250) recaem no fallback seguinte.
  const pageSizeDefault = normalizeInqueritoPageSize(
    currentUser?.inqueritoPageSizeDefault,
    DEFAULT_INQUERITO_PAGE_SIZE,
  )
  const limit =
    sp.perPage !== undefined
      ? normalizeInqueritoPageSize(sp.perPage, pageSizeDefault)
      : pageSizeDefault

  let estadoCodigos: string[] = []
  if (sp.estado === undefined) {
    estadoCodigos = estadosDefault
  } else if (sp.estado === '__none__' || sp.estado === '') {
    estadoCodigos = []
  } else {
    estadoCodigos = sp.estado.split(',').filter(Boolean)
  }

  const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)
  const where = {
    deletedAt: null,
    ...(search && {
      OR: [
        { nuipc: { contains: search, mode: 'insensitive' as const } },
        { nai: { contains: search, mode: 'insensitive' as const } },
        { denuncianteNome: { contains: search, mode: 'insensitive' as const } },
        { denuncianteNif: { contains: search, mode: 'insensitive' as const } },
        { etiquetas: { some: { nome: { contains: search, mode: 'insensitive' as const } } } },
      ],
    }),
    ...(estadoCodigos.length > 0 && {
      estado: { codigo: { in: estadoCodigos } },
    }),
    ...(sp.crimeId && {
      AND: [{ OR: [{ crimeId: sp.crimeId }, { crimesAssociados: { some: { id: sp.crimeId } } }] }],
    }),
    ...(sp.brigadaId && { brigadaId: sp.brigadaId }),
    ...(sp.inspetorId && { inspetorId: sp.inspetorId }),
    ...(sp.etiquetaId && { etiquetas: { some: { id: sp.etiquetaId } } }),
    ...(sp.semInspetor === '1' && { inspetorId: null }),
    ...(sp.overdue === '1' && {
      dataPrazo: { lt: new Date() },
      // overdue implies non-terminal — overrides any estado filter for safety
      estado: { terminal: false },
    }),
    ...((sp.dataAberturaFrom || sp.dataAberturaTo) && {
      dataAbertura: {
        ...(sp.dataAberturaFrom && { gte: new Date(sp.dataAberturaFrom) }),
        ...(sp.dataAberturaTo && { lte: new Date(sp.dataAberturaTo.match(/^\d{4}-\d{2}-\d{2}$/) ? sp.dataAberturaTo + 'T23:59:59.999Z' : sp.dataAberturaTo) }),
      },
    }),
    ...(sp.cartaPrecatoria === '1' && { cartaPrecatoria: true }),
    ...(sp.cartaPrecatoria === '0' && { cartaPrecatoria: false }),
    // roleWhere LAST: scope-locking não pode ser substituído por query string
    // (INSPETOR_CHEFE/INSPETOR). Esta ordem é crítica para segurança.
    ...roleWhere,
  }

  const canCreate = hasPermission(role, 'inquerito:create')
  const canBulk = hasPermission(role, 'inquerito:bulk:brigade')
  const canTransfer = hasPermission(role, 'inquerito:transfer')
  const canImport = hasPermission(role, 'inquerito:bulk:all')
  const showBrigada = hasPermission(role, 'inquerito:read:all')
  const { showInspetor, showDenunciante, showPrazo } = getInqueritoColumnsVisibility(role)

  const [inqueritos, total, inspetores, brigadas, estados, crimes, inspetoresFilter, etiquetasFilter] = await Promise.all([
    prisma.inquerito.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sort]: order } as never,
      include: {
        estado: { select: { id: true, codigo: true, nome: true, cor: true, terminal: true, ativo: true } },
        crime: { select: { id: true, nome: true } },
        brigada: { select: { id: true, nome: true } },
        inspetor: { select: { id: true, nome: true } },
        etiquetas: { select: { id: true, nome: true } },
        _count: { select: { atividades: true } },
      },
    }),
    prisma.inquerito.count({ where }),
    canBulk
      ? prisma.utilizador.findMany({
          where: { role: 'INSPETOR', ativo: true },
          orderBy: { nome: 'asc' },
          select: { id: true, nome: true, brigadaId: true },
        })
      : Promise.resolve([]),
    canBulk
      ? prisma.brigada.findMany({
          where: { ativa: true },
          orderBy: { nome: 'asc' },
          select: { id: true, nome: true },
        })
      : Promise.resolve([]),
    listEstados({ onlyActive: true }),
    prisma.crime.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true },
    }),
    role === 'INSPETOR_CHEFE' && session.user.brigadaId
      ? prisma.utilizador.findMany({
          where: { brigadaId: session.user.brigadaId, ativo: true },
          orderBy: { nome: 'asc' },
          select: { id: true, nome: true },
        })
      : Promise.resolve([]),
    listEtiquetasEmUso(roleWhere),
  ])

  const totalPages = Math.ceil(total / limit)

  // Build pagination URLs preserving filters
  function buildPageUrl(targetPage: number): string {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== 'page') params.set(k, String(v))
    }
    params.set('page', String(targetPage))
    return `/inqueritos?${params.toString()}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Inquéritos</h1>
          <p className="text-muted-foreground text-sm">{total} resultado{total !== 1 ? 's' : ''}</p>
        </div>
        <HelpButton title="Ajuda — Inquéritos" className="shrink-0">
          <HelpSection title="Filtros disponíveis">
            <p>Use a barra de filtros para limitar a lista. Pode combinar vários filtros em simultâneo:</p>
            <ul className="list-disc pl-4 space-y-1 mt-1">
              <li><strong>Pesquisa</strong> — procura por NUIPC, NAI, denunciante ou etiqueta.</li>
              <li><strong>Estado</strong> — filtra por um ou mais estados do inquérito.</li>
              <li><strong>Prazo vencido</strong> — mostra apenas inquéritos com prazo ultrapassado.</li>
              <li><strong>Sem inspetor</strong> — mostra inquéritos por atribuir.</li>
              <li><strong>Carta Precatória</strong> — filtra por tipo (inquérito normal ou carta precatória).</li>
              <li><strong>Data de abertura</strong> — intervalo de datas de início.</li>
            </ul>
          </HelpSection>
          <HelpSection title="Ordenação">
            <p>Clique nos cabeçalhos da tabela ou use o seletor de ordenação para alterar a ordem (última alteração, data de abertura, prazo, NUIPC).</p>
          </HelpSection>
          <HelpSection title="Exportar">
            <p>O botão <strong>Exportar</strong> gera um ficheiro CSV com os inquéritos visíveis (com os filtros ativos). Útil para tratamento em folha de cálculo.</p>
          </HelpSection>
          <HelpSection title="Importar">
            <p>O botão <strong>Importar</strong> permite carregar inquéritos em lote a partir de um CSV. Descarregue o template na página de importação para ver o formato esperado.</p>
          </HelpSection>
          <HelpSection title="Novo inquérito">
            <p>Clique em <strong>Novo</strong> para criar um inquérito manualmente. Pode criar brigadas, tribunais e secções diretamente no formulário se ainda não existirem.</p>
          </HelpSection>
        </HelpButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline">
          <Link href="/inqueritos/kanban" className="flex items-center gap-1.5">
            <Columns3 className="h-4 w-4" />
            Kanban
          </Link>
        </Button>
        <Suspense fallback={null}>
          <ExportButton />
        </Suspense>
        {canImport && (
          <Button size="sm" variant="outline">
            <Link href="/inqueritos/importar" className="flex items-center gap-1.5">
              <Upload className="h-4 w-4" />
              Importar
            </Link>
          </Button>
        )}
        {canCreate && (
          <Button size="sm">
            <Link href="/inqueritos/novo" className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              Novo
            </Link>
          </Button>
        )}
      </div>

      <Suspense fallback={null}>
        <InqueritoFilters
          estados={estados}
          estadosDefault={estadosDefault}
          crimes={crimes}
          etiquetas={etiquetasFilter}
          inspetoresFilter={inspetoresFilter}
          currentUserId={session.user.id}
          showSemInspetor={role !== 'INSPETOR'}
        />
      </Suspense>

      <InqueritoTable
        inqueritos={inqueritos}
        canBulk={canBulk}
        canTransfer={canTransfer}
        showBrigada={showBrigada}
        showInspetor={showInspetor}
        showDenunciante={showDenunciante}
        showPrazo={showPrazo}
        inspetores={inspetores}
        brigadas={brigadas}
        estados={estados}
      />

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Mostrar</span>
            <PageSizeSelect value={limit} currentParams={sp} />
            <span>por página</span>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-3">
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
        </div>
      )}
    </div>
  )
}
