import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import type { Role } from '@/generated/prisma/enums'

const EXPORT_LIMIT = 5000

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
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
    const faseProcessual = searchParams.get('faseProcessual') ?? ''
    const brigadaId = searchParams.get('brigadaId') ?? ''

    const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)
    const where = {
      deletedAt: null,
      ...roleWhere,
      ...(estadoCodigo && { estado: { codigo: estadoCodigo } }),
      ...(faseProcessual && { faseProcessual: faseProcessual as never }),
      ...(brigadaId && { brigadaId }),
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
        estado: { select: { codigo: true, nome: true } },
        faseProcessual: true,
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
        filtros: { estadoCodigo, faseProcessual, brigadaId },
        quantidade: inqueritos.length,
      },
    })

    const headers = [
      'NUIPC',
      'Natureza',
      'Estado',
      'Fase Processual',
      'Data Abertura',
      'Prazo',
      'Data Conclusão',
      'Brigada',
      'Inspetor',
    ]
    const rows = inqueritos.map((i) => [
      i.nuipc,
      i.natureza,
      i.estado.nome,
      i.faseProcessual,
      i.dataAbertura ? new Date(i.dataAbertura).toLocaleDateString('pt-PT') : '',
      i.dataPrazo ? new Date(i.dataPrazo).toLocaleDateString('pt-PT') : '',
      i.dataConclusao ? new Date(i.dataConclusao).toLocaleDateString('pt-PT') : '',
      i.brigada?.nome ?? '',
      i.inspetor?.nome ?? '',
    ])

    const csv = [headers, ...rows].map((row) => row.map(escapeCSV).join(',')).join('\n')

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
