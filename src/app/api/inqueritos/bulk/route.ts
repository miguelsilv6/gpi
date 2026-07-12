import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, buildInqueritoWhere, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { getRequestInfo } from '@/lib/request-info'
import { bulkActionSchema } from '@/lib/validations/inquerito'
import { canTransition } from '@/lib/inquerito-state'
import { findEstadoById, getDistribuidoEstado } from '@/lib/estados'
import type { Role } from '@/generated/prisma/enums'
import type { Prisma } from '@/generated/prisma/client'

const MAX_BULK = 200

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const body = await req.json()

    const parsed = bulkActionSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { ids, action, inspetorId, estadoId, brigadaId } = parsed.data

    if (ids.length > MAX_BULK) {
      return apiError(`Máximo ${MAX_BULK} inquéritos por operação`, 400)
    }

    // Permissions per action
    if (action === 'transfer' && !hasPermission(role, 'inquerito:transfer')) {
      return apiError('Sem permissão para transferir inquéritos', 403)
    }
    if (
      (action === 'assign' || action === 'changeState') &&
      !hasPermission(role, 'inquerito:bulk:brigade')
    ) {
      return apiError('Sem permissão para operações em massa', 403)
    }

    // Required payload per action
    if (action === 'assign' && inspetorId === undefined) return apiError('inspetorId obrigatório', 400)
    if (action === 'changeState' && !estadoId) return apiError('estadoId obrigatório', 400)
    if (action === 'transfer' && !brigadaId) return apiError('brigadaId obrigatório', 400)

    // Scope enforced via buildInqueritoWhere — handles all roles consistently.
    const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)
    if (role === 'INSPETOR_CHEFE' && !session.user.brigadaId) {
      return apiError('Configuração inválida: sem brigada', 403)
    }

    const targets = await prisma.inquerito.findMany({
      where: { id: { in: ids }, deletedAt: null, ...roleWhere },
      select: {
        id: true,
        nuipc: true,
        estadoId: true,
        brigadaId: true,
        inspetorId: true,
        estado: { select: { codigo: true, terminal: true } },
      },
    })

    if (targets.length === 0) return apiError('Nenhum inquérito válido encontrado', 404)

    // Cross-validations per action
    if (action === 'assign' && inspetorId) {
      const inspetor = await prisma.utilizador.findUnique({
        where: { id: inspetorId },
        select: { ativo: true, brigadaId: true },
      })
      if (!inspetor || !inspetor.ativo) return apiError('Inspetor inválido', 400)
      const mismatched = targets.filter((t) => t.brigadaId !== inspetor.brigadaId)
      if (mismatched.length > 0) {
        return apiError(
          `Inspetor não pertence à brigada de ${mismatched.length} inquérito(s)`,
          409,
        )
      }
    }

    if (action === 'transfer' && brigadaId) {
      const brigada = await prisma.brigada.findUnique({
        where: { id: brigadaId },
        select: { ativa: true },
      })
      if (!brigada || !brigada.ativa) return apiError('Brigada destino inválida', 400)
    }

    let targetEstado: { id: string; codigo: string; terminal: boolean; ativo: boolean } | null = null
    if (action === 'changeState' && estadoId) {
      targetEstado = await findEstadoById(estadoId)
      if (!targetEstado || !targetEstado.ativo) return apiError('Estado inválido', 400)
      const invalid = targets.filter((t) => !canTransition(t.estado, targetEstado!))
      if (invalid.length > 0) {
        return apiError(
          `Transição inválida para ${invalid.length} inquérito(s) (alguns em estado terminal)`,
          409,
        )
      }
    }

    const validIds = targets.map((t) => t.id)
    const auditAcao = `BULK_${action.toUpperCase()}`
    const { ip, userAgent } = getRequestInfo(req)

    // Auto-transition for bulk assign: ABERTO inquiries that are getting an
    // inspector for the first time move to DISTRIBUIDO automatically.
    const distribuidoEstado =
      action === 'assign' && inspetorId ? await getDistribuidoEstado() : null

    await prisma.$transaction(async (tx) => {
      const updateData: Prisma.InqueritoUncheckedUpdateManyInput = {}
      if (action === 'assign') updateData.inspetorId = inspetorId ?? null
      if (action === 'changeState' && estadoId) updateData.estadoId = estadoId
      if (action === 'transfer' && brigadaId) {
        updateData.brigadaId = brigadaId
        updateData.inspetorId = null
      }

      if (action === 'assign' && distribuidoEstado?.ativo) {
        // Split: ABERTO without inspector → also set estado to DISTRIBUIDO.
        const toDistribuido = targets
          .filter((t) => t.estado.codigo === 'ABERTO' && !t.inspetorId)
          .map((t) => t.id)
        const others = validIds.filter((id) => !toDistribuido.includes(id))
        if (toDistribuido.length > 0) {
          await tx.inquerito.updateMany({
            where: { id: { in: toDistribuido } },
            data: { inspetorId, estadoId: distribuidoEstado.id },
          })
        }
        if (others.length > 0) {
          await tx.inquerito.updateMany({
            where: { id: { in: others } },
            data: { inspetorId },
          })
        }
      } else {
        await tx.inquerito.updateMany({
          where: { id: { in: validIds } },
          data: updateData,
        })
      }

      await tx.auditLog.createMany({
        data: targets.map((t) => ({
          acao: auditAcao,
          entidade: 'Inquerito',
          entidadeId: t.id,
          utilizadorId: session.user.id,
          ip,
          userAgent,
          detalhes: {
            nuipc: t.nuipc,
            before: {
              estadoCodigo: t.estado.codigo,
              brigadaId: t.brigadaId,
              inspetorId: t.inspetorId,
            },
            after:
              action === 'changeState' && targetEstado
                ? { estadoCodigo: targetEstado.codigo }
                : (action === 'assign' && distribuidoEstado?.ativo && t.estado.codigo === 'ABERTO' && !t.inspetorId)
                  ? { ...updateData, estadoCodigo: distribuidoEstado.codigo }
                  : updateData,
          },
        })),
      })
    })

    revalidatePath('/inqueritos')
    revalidatePath('/dashboard')

    return Response.json({ updated: validIds.length, skipped: ids.length - validIds.length })
  } catch (error) {
    return handleApiError(error)
  }
}
