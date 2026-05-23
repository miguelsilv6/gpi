import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

/**
 * Cancela uma atualização que ainda esteja em AVAILABLE (pré-backup). Uma vez
 * que o backup começa não há cancelamento — o fluxo segue até DONE ou
 * ROLLED_BACK/FAILED.
 *
 * Body: { id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão', 403)
    }

    const body = (await req.json().catch(() => ({}))) as { id?: unknown }
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return apiError('id em falta', 400)

    const row = await prisma.atualizacaoSistema.findUnique({ where: { id } })
    if (!row) return apiError('Atualização não encontrada', 404)
    if (row.state !== 'AVAILABLE') {
      return apiError(
        `Não é possível cancelar — atualização já em fase ${row.state}`,
        409,
      )
    }

    await prisma.atualizacaoSistema.update({
      where: { id },
      data: {
        state: 'FAILED',
        finishedAt: new Date(),
        errorMessage: `Cancelada por ${session.user.id}`,
      },
    })

    // Cancelar antes do backup começar implica nada destrutivo aconteceu —
    // libertar o modo de manutenção que foi ativado em /start.
    await prisma.configuracaoSistema.update({
      where: { id: 'singleton' },
      data: { maintenanceMode: false },
    })

    await prisma.auditLog.create({
      data: {
        acao: 'UPDATE_CANCELLED',
        entidade: 'AtualizacaoSistema',
        entidadeId: id,
        utilizadorId: session.user.id,
        detalhes: {} as never,
      },
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
