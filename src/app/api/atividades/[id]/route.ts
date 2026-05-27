import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit, diff } from '@/lib/audit'
import { nuipcToSlug } from '@/lib/utils'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const ALERT_OPTIONS = [1, 2, 5, 7, 15, 30]

const updateSchema = z.object({
  // descricao is immutable in practice — changing the type changes the
  // semantics of the activity. The form should treat the type as fixed and
  // only allow editing the surrounding metadata. We accept it for clients
  // that send the full payload, but the API silently ignores changes to it.
  descricao: z.string().min(1).optional(),
  observacoes: z.string().max(2000).optional().nullable(),
  dataRealizacao: z.string().optional(),
  quantidade: z.number().int().min(1).optional().nullable(),
  dataPrazo: z.string().optional().nullable(),
  alertaDias1: z.number().int().refine((v) => ALERT_OPTIONS.includes(v)).optional().nullable(),
  alertaDias2: z.number().int().refine((v) => ALERT_OPTIONS.includes(v)).optional().nullable(),
  // ISO datetime string when concluding, or null to reopen. `undefined` =
  // not part of this update.
  concluidaEm: z.string().datetime().nullable().optional(),
})

/** Returns true if `session.user` may edit/delete `atividade`. */
function canMutate(
  role: Role,
  userId: string,
  brigadaId: string | null,
  atividade: { utilizadorId: string },
  inquerito: { inspetorId: string | null; brigadaId: string | null },
): boolean {
  // ESTATISTICA never writes atividades
  if (role === 'ESTATISTICA') return false
  // COORDENADOR / ADMINISTRACAO: anywhere
  if (role === 'COORDENADOR' || role === 'ADMINISTRACAO') return true
  // INSPETOR_CHEFE: anything in their brigada
  if (role === 'INSPETOR_CHEFE') {
    return !!brigadaId && inquerito.brigadaId === brigadaId
  }
  // INSPETOR: only their own atividades, on inquéritos they're assigned to
  if (role === 'INSPETOR') {
    return atividade.utilizadorId === userId && inquerito.inspetorId === userId
  }
  return false
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    const { id } = await params
    const existing = await prisma.atividade.findUnique({
      where: { id },
      include: {
        inquerito: {
          select: {
            id: true,
            nuipc: true,
            inspetorId: true,
            brigadaId: true,
            deletedAt: true,
            estado: { select: { terminal: true } },
          },
        },
      },
    })
    if (!existing || existing.inquerito.deletedAt) {
      return apiError('Atividade não encontrada', 404)
    }
    if (existing.inquerito.estado.terminal) {
      return apiError(
        'Não é possível editar atividades de um inquérito em estado terminal',
        409,
      )
    }
    if (!canMutate(role, session.user.id, session.user.brigadaId, existing, existing.inquerito)) {
      return apiError('Sem permissão para editar esta atividade', 403)
    }

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)
    const data = parsed.data

    const updateData: Record<string, unknown> = {}
    if (data.observacoes !== undefined) {
      updateData.observacoes = data.observacoes?.toString().trim() || null
    }
    if (data.dataRealizacao !== undefined) {
      updateData.dataRealizacao = data.dataRealizacao
        ? new Date(data.dataRealizacao)
        : new Date()
    }
    if (data.quantidade !== undefined) updateData.quantidade = data.quantidade
    if (data.dataPrazo !== undefined) {
      updateData.dataPrazo = data.dataPrazo ? new Date(data.dataPrazo) : null
    }
    if (data.alertaDias1 !== undefined) updateData.alertaDias1 = data.alertaDias1
    if (data.alertaDias2 !== undefined) updateData.alertaDias2 = data.alertaDias2
    if (data.concluidaEm !== undefined) {
      updateData.concluidaEm = data.concluidaEm ? new Date(data.concluidaEm) : null
    }

    const updated = await prisma.atividade.update({
      where: { id },
      data: updateData,
      include: { realizadaPor: { select: { id: true, nome: true } } },
    })

    // Audit diff — log against the parent Inquerito so the history of the
    // inquérito surfaces atividade changes alongside its own changes.
    const before = {
      observacoes: existing.observacoes,
      quantidade: existing.quantidade,
      dataRealizacao: existing.dataRealizacao,
      dataPrazo: existing.dataPrazo,
      alertaDias1: existing.alertaDias1,
      alertaDias2: existing.alertaDias2,
      concluidaEm: existing.concluidaEm,
    }
    const after = {
      observacoes: updated.observacoes,
      quantidade: updated.quantidade,
      dataRealizacao: updated.dataRealizacao,
      dataPrazo: updated.dataPrazo,
      alertaDias1: updated.alertaDias1,
      alertaDias2: updated.alertaDias2,
      concluidaEm: updated.concluidaEm,
    }
    const changes = diff(before, after, [
      'observacoes',
      'quantidade',
      'dataRealizacao',
      'dataPrazo',
      'alertaDias1',
      'alertaDias2',
      'concluidaEm',
    ])

    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_ATIVIDADE',
        entidade: 'Inquerito',
        entidadeId: existing.inquerito.id,
        utilizadorId: session.user.id,
        detalhes: {
          atividadeId: id,
          descricao: existing.descricao,
          ...changes,
        } as never,
      })
    }

    revalidatePath(`/inqueritos/${nuipcToSlug(existing.inquerito.nuipc)}`)
    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    const { id } = await params
    const existing = await prisma.atividade.findUnique({
      where: { id },
      include: {
        inquerito: {
          select: {
            id: true,
            nuipc: true,
            inspetorId: true,
            brigadaId: true,
            deletedAt: true,
            estado: { select: { terminal: true } },
          },
        },
      },
    })
    if (!existing || existing.inquerito.deletedAt) {
      return apiError('Atividade não encontrada', 404)
    }
    if (existing.inquerito.estado.terminal) {
      return apiError(
        'Não é possível eliminar atividades de um inquérito em estado terminal',
        409,
      )
    }
    if (!canMutate(role, session.user.id, session.user.brigadaId, existing, existing.inquerito)) {
      return apiError('Sem permissão para eliminar esta atividade', 403)
    }

    await prisma.atividade.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_ATIVIDADE',
      entidade: 'Inquerito',
      entidadeId: existing.inquerito.id,
      utilizadorId: session.user.id,
      detalhes: {
        atividadeId: id,
        descricao: existing.descricao,
        dataRealizacao: existing.dataRealizacao.toISOString(),
        quantidade: existing.quantidade,
      } as never,
    })

    revalidatePath(`/inqueritos/${nuipcToSlug(existing.inquerito.nuipc)}`)
    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
