import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { forceAbortUpdate } from '@/lib/updates/orchestrator'
import type { Role } from '@/generated/prisma/enums'

/**
 * Cancela ou aborta uma atualização.
 *
 * Body: { id: string; force?: boolean }
 *
 * Sem `force` (padrão): só funciona em estado AVAILABLE (pré-backup). Uma vez
 * que o backup começa não há cancelamento normal — o fluxo segue até DONE ou
 * ROLLED_BACK/FAILED.
 *
 * Com `force: true` (apenas ADMINISTRACAO): aborta em qualquer estado
 * não-terminal. Usado para destravar updates presos (ex: PULLING suspenso).
 * Limpa os ficheiros de controlo e desativa modo de manutenção.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão', 403)
    }

    const body = (await req.json().catch(() => ({}))) as { id?: unknown; force?: unknown }
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return apiError('id em falta', 400)
    const force = body.force === true

    if (force) {
      if (role !== 'ADMINISTRACAO') {
        return apiError('Apenas ADMINISTRACAO pode forçar o cancelamento', 403)
      }
      try {
        await forceAbortUpdate(id, session.user.id)
      } catch (err) {
        const code = (err as Error & { cause?: number }).cause
        if (code === 404) return apiError('Atualização não encontrada', 404)
        if (code === 409) return apiError((err as Error).message, 409)
        throw err
      }
      return Response.json({ ok: true, forced: true })
    }

    const row = await prisma.atualizacaoSistema.findUnique({ where: { id } })
    if (!row) return apiError('Atualização não encontrada', 404)
    if (row.state !== 'AVAILABLE') {
      return apiError(
        `Não é possível cancelar — atualização já em fase ${row.state}. Use force:true para abortar.`,
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
        detalhes: {},
      },
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
