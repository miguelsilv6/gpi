import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { buildInqueritoWhere } from '@/lib/role-scope'
import { writeAudit } from '@/lib/audit'
import { buildCsv, csvResponse, CSV_EXPORT_LIMIT } from '@/lib/csv'
import { PRIORIDADE_LABEL } from '@/components/tarefas/tarefa-shared'
import type { Role } from '@/generated/prisma/enums'

// Exportação CSV das tarefas pessoais do utilizador (as mesmas da página
// /tarefas: só as próprias, nos inquéritos a que tem acesso).
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (role === 'ESTATISTICA' || !hasPermission(role, 'inquerito:export')) {
      return apiError('Sem permissão para exportar', 403)
    }

    const e = req.nextUrl.searchParams.get('estado')
    const estadoWhere = e === 'pendentes' ? { concluida: false } : e === 'concluidas' ? { concluida: true } : {}
    const scope = buildInqueritoWhere(role, session.user.id, session.user.brigadaId ?? null)

    const rows = await prisma.tarefaInquerito.findMany({
      where: {
        autorId: session.user.id,
        ...estadoWhere,
        inquerito: { AND: [{ deletedAt: null }, scope] },
      },
      orderBy: [{ concluida: 'asc' }, { prioridade: 'desc' }, { createdAt: 'desc' }],
      take: CSV_EXPORT_LIMIT,
      select: {
        titulo: true,
        descricao: true,
        prioridade: true,
        concluida: true,
        concluidaEm: true,
        createdAt: true,
        inquerito: { select: { nuipc: true } },
      },
    })

    await writeAudit({
      req,
      acao: 'EXPORT_TAREFAS',
      entidade: 'TarefaInquerito',
      entidadeId: '__bulk_export__',
      utilizadorId: session.user.id,
      detalhes: { filtros: { estado: e ?? 'todas' }, quantidade: rows.length },
    })

    const csv = buildCsv(
      ['NUIPC', 'Tarefa', 'Descrição', 'Prioridade', 'Estado', 'Criada em', 'Concluída em'],
      rows.map((t) => [
        t.inquerito.nuipc,
        t.titulo,
        t.descricao,
        PRIORIDADE_LABEL[t.prioridade],
        t.concluida ? 'Concluída' : 'Pendente',
        t.createdAt,
        t.concluidaEm,
      ]),
    )
    return csvResponse('tarefas', csv)
  } catch (error) {
    return handleApiError(error)
  }
}
