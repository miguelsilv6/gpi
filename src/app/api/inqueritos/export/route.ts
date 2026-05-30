import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { UTF8_BOM } from '@/lib/relatorios/formatters'
import type { Role } from '@/generated/prisma/enums'

const EXPORT_LIMIT = 5000

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:export')) {
      return apiError('Sem permissão para exportar inquéritos', 403)
    }

    const { searchParams } = new URL(req.url)
    const estadoCodigo = searchParams.get('estado') ?? ''
    const crimeId = searchParams.get('crimeId') ?? ''
    const brigadaId = searchParams.get('brigadaId') ?? ''
    const inspetorId = searchParams.get('inspetorId') ?? ''
    const etiquetaId = searchParams.get('etiquetaId') ?? ''
    const overdue = searchParams.get('overdue') === '1'
    const semInspetor = searchParams.get('semInspetor') === '1'
    const search = searchParams.get('search') ?? ''
    const dataAberturaFrom = searchParams.get('dataAberturaFrom') ?? ''
    const dataAberturaTo = searchParams.get('dataAberturaTo') ?? ''

    const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)

    const isValidDate = (s: string) => s && !Number.isNaN(new Date(s).getTime())

    const where = {
      deletedAt: null,
      ...(search && {
        OR: [
          { nuipc: { contains: search, mode: 'insensitive' as const } },
          { nai: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(estadoCodigo && { estado: { codigo: estadoCodigo } }),
      ...(crimeId && { crimeId }),
      ...(brigadaId && { brigadaId }),
      ...(inspetorId && { inspetorId }),
      ...(etiquetaId && { etiquetas: { some: { id: etiquetaId } } }),
      ...(semInspetor && { inspetorId: null }),
      ...(overdue && { dataPrazo: { lt: new Date() }, estado: { terminal: false } }),
      ...((dataAberturaFrom || dataAberturaTo) && {
        dataAbertura: {
          ...(isValidDate(dataAberturaFrom) && { gte: new Date(dataAberturaFrom) }),
          ...(isValidDate(dataAberturaTo) && { lte: new Date(dataAberturaTo) }),
        },
      }),
      // roleWhere LAST: garante que INSPETOR_CHEFE/INSPETOR não escapam ao
      // scope via injecção de ?brigadaId/?inspetorId na URL.
      ...roleWhere,
    }

    const total = await prisma.inquerito.count({ where })
    if (total > EXPORT_LIMIT) {
      return apiError(
        `Limite de ${EXPORT_LIMIT} registos por exportação. Total filtrado: ${total}. Refine os filtros.`,
        413,
      )
    }

    const inqueritos = await prisma.inquerito.findMany({
      where,
      orderBy: { dataAbertura: 'desc' },
      take: EXPORT_LIMIT,
      select: {
        nuipc: true,
        natureza: true,
        crime: { select: { nome: true } },
        estado: { select: { codigo: true, nome: true } },
        dataAbertura: true,
        dataPrazo: true,
        dataConclusao: true,
        brigada: { select: { nome: true } },
        inspetor: { select: { nome: true } },
      },
    })

    // Audit the export — record filters and result count (mandatory in a police platform).
    await writeAudit({
      req,
      acao: 'EXPORT_INQUERITOS',
      entidade: 'Inquerito',
      entidadeId: '__bulk_export__',
      utilizadorId: session.user.id,
      detalhes: {
        filtros: { estadoCodigo, crimeId, brigadaId, inspetorId, etiquetaId, overdue, semInspetor, search, dataAberturaFrom, dataAberturaTo },
        quantidade: inqueritos.length,
      },
    })

    const headers = [
      'NUIPC',
      'Crime',
      'Estado',
      'Data Abertura',
      'Prazo',
      'Data Conclusão',
      'Brigada',
      'Inspetor',
    ]
    const rows = inqueritos.map((i) => [
      i.nuipc,
      i.crime?.nome ?? i.natureza,
      i.estado.nome,
      i.dataAbertura ? new Date(i.dataAbertura).toLocaleDateString('pt-PT') : '',
      i.dataPrazo ? new Date(i.dataPrazo).toLocaleDateString('pt-PT') : '',
      i.dataConclusao ? new Date(i.dataConclusao).toLocaleDateString('pt-PT') : '',
      i.brigada?.nome ?? '',
      i.inspetor?.nome ?? '',
    ])

    const csv = UTF8_BOM + [headers, ...rows].map((row) => row.map(escapeCSV).join(',')).join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="inqueritos-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

