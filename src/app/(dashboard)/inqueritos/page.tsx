import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { Button } from '@/components/ui/button'
import { InqueritoFilters } from '@/components/inqueritos/inquerito-filters'
import { InqueritoTable } from '@/components/inqueritos/inquerito-table'
import { ExportButton } from '@/components/inqueritos/export-button'
import { Plus, Upload } from 'lucide-react'
import Link from 'next/link'
import { listEstados } from '@/lib/estados'
import type { Role } from '@/generated/prisma/enums'

interface SearchParams {
  page?: string
  search?: string
  estado?: string
  crimeId?: string
  brigadaId?: string
  inspetorId?: string
  overdue?: string
  semInspetor?: string
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
  const limit = 20

  const sort = sp.sort && ALLOWED_SORT[sp.sort] ? sp.sort : 'updatedAt'
  const order = sp.order === 'asc' ? 'asc' : 'desc'

  // Read the system-wide default for the estado filter. Used when the URL
  // has no `estado` param (initial visit). Sentinel `__none__` means the user
  // explicitly chose "no estado filter".
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { inqueritoFiltroEstadosDefault: true },
  })
  const estadosDefault = config?.inqueritoFiltroEstadosDefault ?? []

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
    ...roleWhere,
    ...(sp.search && {
      OR: [
        { nuipc: { contains: sp.search, mode: 'insensitive' as const } },
        { nai: { contains: sp.search, mode: 'insensitive' as const } },
        { natureza: { contains: sp.search, mode: 'insensitive' as const } },
      ],
    }),
    ...(estadoCodigos.length > 0 && {
      estado: { codigo: { in: estadoCodigos } },
    }),
    ...(sp.crimeId && { crimeId: sp.crimeId }),
    ...(sp.brigadaId && { brigadaId: sp.brigadaId }),
    ...(sp.inspetorId && { inspetorId: sp.inspetorId }),
    ...(sp.semInspetor === '1' && { inspetorId: null }),
    ...(sp.overdue === '1' && {
      dataPrazo: { lt: new Date() },
      // overdue implies non-terminal — overrides any estado filter for safety
      estado: { terminal: false },
    }),
    ...((sp.dataAberturaFrom || sp.dataAberturaTo) && {
      dataAbertura: {
        ...(sp.dataAberturaFrom && { gte: new Date(sp.dataAberturaFrom) }),
        ...(sp.dataAberturaTo && { lte: new Date(sp.dataAberturaTo) }),
      },
    }),
  }

  const canCreate = hasPermission(role, 'inquerito:create')
  const canBulk = hasPermission(role, 'inquerito:bulk:brigade')
  const canTransfer = hasPermission(role, 'inquerito:transfer')
  const canImport = hasPermission(role, 'inquerito:bulk:all')
  const showBrigada = hasPermission(role, 'inquerito:read:all')

  const [inqueritos, total, inspetores, brigadas, estados, crimes] = await Promise.all([
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inquéritos</h1>
          <p className="text-muted-foreground text-sm">{total} resultado{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      <Suspense fallback={null}>
        <InqueritoFilters
          estados={estados}
          estadosDefault={estadosDefault}
          crimes={crimes}
        />
      </Suspense>

      <InqueritoTable
        inqueritos={inqueritos}
        canBulk={canBulk}
        canTransfer={canTransfer}
        showBrigada={showBrigada}
        inspetores={inspetores}
        brigadas={brigadas}
        estados={estados}
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
    </div>
  )
}
