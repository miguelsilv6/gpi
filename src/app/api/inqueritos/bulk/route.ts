import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { bulkActionSchema } from '@/lib/validations/inquerito'
import { canTransition } from '@/lib/inquerito-state'
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

    const { ids, action, inspetorId, estado, faseProcessual, brigadaId } = parsed.data

    if (ids.length > MAX_BULK) {
      return apiError(`Máximo ${MAX_BULK} inquéritos por operação`, 400)
    }

    // Permissions per action
    if (action === 'transfer' && !hasPermission(role, 'inquerito:transfer')) {
      return apiError('Sem permissão para transferir inquéritos', 403)
    }
    if (
      (action === 'assign' || action === 'changeState' || action === 'changeFase') &&
      !hasPermission(role, 'inquerito:bulk:brigade')
    ) {
      return apiError('Sem permissão para operações em massa', 403)
    }

    // Required payload per action
    if (action === 'assign' && inspetorId === undefined) return apiError('inspetorId obrigatório', 400)
    if (action === 'changeState' && !estado) return apiError('estado obrigatório', 400)
    if (action === 'changeFase' && !faseProcessual) return apiError('faseProcessual obrigatória', 400)
    if (action === 'transfer' && !brigadaId) return apiError('brigadaId obrigatório', 400)

    // Scope: INSPETOR_CHEFE limited to own brigada
    const scopeWhere: Prisma.InqueritoWhereInput = { deletedAt: null }
    if (role === 'INSPETOR_CHEFE') {
      if (!session.user.brigadaId) return apiError('Configuração inválida: sem brigada', 403)
      scopeWhere.brigadaId = session.user.brigadaId
    }

    const targets = await prisma.inquerito.findMany({
      where: { id: { in: ids }, ...scopeWhere },
      select: {
        id: true,
        nuipc: true,
        estado: true,
        brigadaId: true,
        inspetorId: true,
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
      // All targets must belong to the inspetor's brigada
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

    if (action === 'changeState' && estado) {
      const invalid = targets.filter((t) => !canTransition(t.estado, estado))
      if (invalid.length > 0) {
        return apiError(
          `Transição inválida para ${invalid.length} inquérito(s) (alguns em estado terminal)`,
          409,
        )
      }
    }

    const validIds = targets.map((t) => t.id)
    const auditAcao = `BULK_${action.toUpperCase()}`

    // Execute in a transaction so audit + update succeed together
    await prisma.$transaction(async (tx) => {
      const data: Prisma.InqueritoUncheckedUpdateManyInput = {}
      if (action === 'assign') data.inspetorId = inspetorId ?? null
      if (action === 'changeState' && estado) data.estado = estado
      if (action === 'changeFase' && faseProcessual) data.faseProcessual = faseProcessual
      if (action === 'transfer' && brigadaId) {
        data.brigadaId = brigadaId
        data.inspetorId = null
      }

      await tx.inquerito.updateMany({
        where: { id: { in: validIds } },
        data,
      })

      await tx.auditLog.createMany({
        data: targets.map((t) => ({
          acao: auditAcao,
          entidade: 'Inquerito',
          entidadeId: t.id,
          utilizadorId: session.user.id,
          detalhes: {
            nuipc: t.nuipc,
            before: {
              estado: t.estado,
              brigadaId: t.brigadaId,
              inspetorId: t.inspetorId,
            },
            after: data,
          } as never,
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
