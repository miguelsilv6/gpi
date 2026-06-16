import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { writeAudit } from '@/lib/audit'
import { isTerminal } from '@/lib/updates/state-machine'
import type { UpdateState } from '@/lib/updates/state-machine'
import type { Role } from '@/generated/prisma/enums'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.user) return apiError('Não autenticado', 401)
    const role = session.user.role as Role
    if (role !== 'ADMINISTRACAO') return apiError('Sem permissão', 403)

    const { id } = await params

    const row = await prisma.atualizacaoSistema.findUnique({ where: { id } })
    if (!row) return apiError('Entrada não encontrada', 404)
    if (!isTerminal(row.state as UpdateState)) {
      return apiError('Só é possível eliminar atualizações já concluídas (DONE, FAILED, ROLLED_BACK)', 409)
    }

    await prisma.$transaction([
      prisma.auditLog.deleteMany({ where: { entidade: 'AtualizacaoSistema', entidadeId: id } }),
      prisma.atualizacaoSistema.delete({ where: { id } }),
    ])

    await writeAudit({
      req,
      acao: 'DELETE_UPDATE_HISTORY',
      entidade: 'AtualizacaoSistema',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { fromVersion: row.fromVersion, toVersion: row.toVersion, state: row.state } as never,
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
