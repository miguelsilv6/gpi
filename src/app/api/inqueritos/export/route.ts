import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere, getInqueritoColumnsVisibility } from '@/lib/auth-helpers'
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
    const cartaPrecatoriaParam = searchParams.get('cartaPrecatoria')

    const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)
    const { showInspetor, showDenunciante, showPrazo } = getInqueritoColumnsVisibility(role)

    const isValidDate = (s: string) => !!s && !Number.isNaN(new Date(s).getTime())
    // Datas ISO YYYY-MM-DD são interpretadas como T00:00:00Z; o limite superior
    // deve cobrir o dia inteiro para não excluir inquéritos criados nesse dia.
    const endOfDay = (s: string) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T23:59:59.999Z')
      const d = new Date(s)
      d.setHours(23, 59, 59, 999)
      return d
    }

    const where = {
      deletedAt: null,
      ...(search && {
        OR: [
          { nuipc: { contains: search, mode: 'insensitive' as const } },
          { nai: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(estadoCodigo && { estado: { codigo: estadoCodigo } }),
      ...(crimeId && {
        AND: [{ OR: [{ crimeId }, { crimesAssociados: { some: { id: crimeId } } }] }],
      }),
      ...(brigadaId && { brigadaId }),
      ...(inspetorId && { inspetorId }),
      ...(etiquetaId && { etiquetas: { some: { id: etiquetaId } } }),
      ...(semInspetor && { inspetorId: null }),
      ...(overdue && { dataPrazo: { lt: new Date() }, estado: { terminal: false } }),
      ...((dataAberturaFrom || dataAberturaTo) && {
        dataAbertura: {
          ...(isValidDate(dataAberturaFrom) && { gte: new Date(dataAberturaFrom) }),
          ...(isValidDate(dataAberturaTo) && { lte: endOfDay(dataAberturaTo) }),
        },
      }),
      ...(cartaPrecatoriaParam === '1' && { cartaPrecatoria: true }),
      ...(cartaPrecatoriaParam === '0' && { cartaPrecatoria: false }),
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
        cartaPrecatoria: true,
        crime: { select: { nome: true } },
        crimesAssociados: { select: { nome: true }, orderBy: { nome: 'asc' } },
        estado: { select: { codigo: true, nome: true } },
        dataAbertura: true,
        dataPrazo: true,
        dataConclusao: true,
        brigada: { select: { nome: true } },
        inspetor: { select: { nome: true } },
        denuncianteNome: true,
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
        filtros: { estadoCodigo, crimeId, brigadaId, inspetorId, etiquetaId, overdue, semInspetor, search, dataAberturaFrom, dataAberturaTo, cartaPrecatoria: cartaPrecatoriaParam },
        quantidade: inqueritos.length,
      },
    })

    // Colunas seguem a mesma visibilidade por role da tabela /inqueritos —
    // o export não deve revelar Prazo nem omitir Denunciante de forma
    // inconsistente com o que o utilizador vê na lista.
    const headers = [
      'NUIPC',
      'Tipo',
      'Crime Principal',
      'Crimes Associados',
      'Estado',
      'Data Abertura',
      ...(showPrazo ? ['Prazo'] : []),
      'Data Conclusão',
      'Brigada',
      ...(showInspetor ? ['Inspetor'] : []),
      ...(showDenunciante ? ['Denunciante'] : []),
    ]
    const rows = inqueritos.map((i) => [
      i.nuipc,
      i.cartaPrecatoria ? 'Carta Precatória' : 'Inquérito',
      i.crime?.nome ?? i.natureza,
      i.crimesAssociados.map((c) => c.nome).join('; '),
      i.estado.nome,
      i.dataAbertura ? new Date(i.dataAbertura).toLocaleDateString('pt-PT') : '',
      ...(showPrazo ? [i.dataPrazo ? new Date(i.dataPrazo).toLocaleDateString('pt-PT') : ''] : []),
      i.dataConclusao ? new Date(i.dataConclusao).toLocaleDateString('pt-PT') : '',
      i.brigada?.nome ?? '',
      ...(showInspetor ? [i.inspetor?.nome ?? ''] : []),
      ...(showDenunciante ? [i.denuncianteNome ?? ''] : []),
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

