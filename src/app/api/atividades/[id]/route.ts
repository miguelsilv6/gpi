import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { atividadeMutationAccess, isColaboradorAtivo } from '@/lib/colaboradores'
import { writeAudit, diff } from '@/lib/audit'
import { applyAtividadeTransicao } from '@/lib/atividade-transicao'
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

/**
 * Resolve os dois níveis de acesso à mutação de uma atividade (ver
 * `atividadeMutationAccess`). Consulta a BD apenas quando é preciso saber se o
 * INSPETOR não-titular é colaborador ativo.
 */
async function resolveAtividadeAccess(
  role: Role,
  userId: string,
  brigadaId: string | null,
  atividade: { utilizadorId: string },
  inquerito: { id: string; inspetorId: string | null; brigadaId: string | null },
): Promise<{ canWork: boolean; canEditEntry: boolean }> {
  const isTitular = inquerito.inspetorId === userId
  const colaboradorAtivo =
    role === 'INSPETOR' && !isTitular ? await isColaboradorAtivo(inquerito.id, userId) : false
  return atividadeMutationAccess(role, {
    isCreator: atividade.utilizadorId === userId,
    isTitular,
    isColaboradorAtivo: colaboradorAtivo,
    inBrigada: !!brigadaId && inquerito.brigadaId === brigadaId,
  })
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
            estado: { select: { id: true, codigo: true, terminal: true, ativo: true } },
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
    const { canWork, canEditEntry } = await resolveAtividadeAccess(
      role, session.user.id, session.user.brigadaId, existing, existing.inquerito,
    )
    // Concluir (só `concluidaEm`) é trabalho operacional — basta `canWork`.
    // Editar os metadados exige ser o autor (ou hierarquia) — `canEditEntry`.
    if (!canWork) {
      return apiError('Sem permissão para editar esta atividade', 403)
    }

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)
    const data = parsed.data

    // `descricao` é imutável; alterá-la não conta como edição de metadados.
    const touchesMetadata =
      data.observacoes !== undefined ||
      data.dataRealizacao !== undefined ||
      data.quantidade !== undefined ||
      data.dataPrazo !== undefined ||
      data.alertaDias1 !== undefined ||
      data.alertaDias2 !== undefined
    if (touchesMetadata && !canEditEntry) {
      return apiError('Só o autor da atividade pode editar os seus dados', 403)
    }

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

    // Confirmar a conclusão (concluidaEm: null → data) pode disparar uma
    // transição de estado configurada pelo admin no AtividadePadrao
    // (transicaoEstadoConclusao). Update + transição na mesma transação.
    const confirmandoConclusao =
      existing.concluidaEm === null && updateData.concluidaEm instanceof Date

    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.atividade.update({
        where: { id },
        data: updateData,
        include: { realizadaPor: { select: { id: true, nome: true } } },
      })

      if (confirmandoConclusao) {
        // Reler o estado do inquérito dentro da transação — evita aplicar a
        // transição com base num estado obsoleto caso tenha mudado entre o
        // findUnique inicial e este momento.
        const currentInquerito = await tx.inquerito.findUniqueOrThrow({
          where: { id: existing.inquerito.id },
          select: {
            id: true,
            estadoId: true,
            estado: { select: { id: true, codigo: true, terminal: true, ativo: true } },
          },
        })

        await applyAtividadeTransicao({
          tx,
          fase: 'conclusao',
          atividade: {
            id: upd.id,
            descricao: upd.descricao,
            dataRealizacao: updateData.concluidaEm as Date,
          },
          inquerito: {
            id: currentInquerito.id,
            estadoId: currentInquerito.estadoId,
            estado: currentInquerito.estado,
          },
          utilizadorId: session.user.id,
          req,
        })
      }

      return upd
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
    // Eliminar é uma ação de "dono da entrada": autor (INSPETOR) ou hierarquia.
    const { canEditEntry } = await resolveAtividadeAccess(
      role, session.user.id, session.user.brigadaId, existing, existing.inquerito,
    )
    if (!canEditEntry) {
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
