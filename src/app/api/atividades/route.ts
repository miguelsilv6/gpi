import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { getRequestInfo } from '@/lib/request-info'
import { applyAtividadeTransicao } from '@/lib/atividade-transicao'
import { notifyAtividadeAdicionada } from '@/lib/notifications'
import { nuipcToSlug } from '@/lib/utils'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const ALERT_OPTIONS = [1, 2, 5, 7, 15, 30]

const schema = z.object({
  inqueritoid: z.string().min(1),
  descricao: z.string().min(1, 'Selecione uma atividade'),
  observacoes: z.string().max(2000).optional().nullable(),
  dataRealizacao: z.string().optional(),
  quantidade: z.number().int().min(1).optional().nullable(),
  dataPrazo: z.string().optional().nullable(),
  alertaDias1: z.number().int().refine((v) => ALERT_OPTIONS.includes(v)).optional().nullable(),
  alertaDias2: z.number().int().refine((v) => ALERT_OPTIONS.includes(v)).optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!hasPermission(role, 'atividade:create:own')) {
      return apiError('Sem permissão para adicionar atividades', 403)
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { inqueritoid, descricao, observacoes, dataRealizacao, quantidade, dataPrazo, alertaDias1, alertaDias2 } = parsed.data

    // Find inquiry and check access
    const inquerito = await prisma.inquerito.findUnique({
      where: { id: inqueritoid },
      include: {
        inspetor: { select: { id: true, email: true, nome: true } },
        estado: { select: { id: true, codigo: true, terminal: true, ativo: true } },
      },
    })
    if (!inquerito || inquerito.deletedAt) return apiError('Inquérito não encontrado', 404)

    // Block on terminal states — activities are investigative records.
    if (inquerito.estado.terminal) {
      return apiError(
        'Não é possível adicionar atividades a um inquérito em estado terminal',
        409,
      )
    }

    const canAdd =
      role === 'ESTATISTICA' ? false :
      role === 'INSPETOR' ? inquerito.inspetorId === session.user.id :
      role === 'INSPETOR_CHEFE' ? inquerito.brigadaId === session.user.brigadaId :
      true

    if (!canAdd) return apiError('Sem permissão para adicionar atividade neste inquérito', 403)

    const dataRealizacaoDate = dataRealizacao ? new Date(dataRealizacao) : new Date()
    const { ip, userAgent } = getRequestInfo(req)

    // Wrap creation + audit + potential state transition in a single
    // transaction so they remain consistent.
    const { atividade, transicao } = await prisma.$transaction(async (tx) => {
      const created = await tx.atividade.create({
        data: {
          descricao,
          observacoes: observacoes ?? null,
          quantidade: quantidade ?? null,
          dataPrazo: dataPrazo ? new Date(dataPrazo) : null,
          alertaDias1: alertaDias1 ?? null,
          alertaDias2: alertaDias2 ?? null,
          dataRealizacao: dataRealizacaoDate,
          inqueritoid,
          utilizadorId: session.user.id,
        },
        include: {
          realizadaPor: { select: { id: true, nome: true } },
        },
      })

      await tx.auditLog.create({
        data: {
          acao: 'CREATE_ATIVIDADE',
          entidade: 'Atividade',
          entidadeId: created.id,
          utilizadorId: session.user.id,
          ip,
          userAgent,
          detalhes: {
            inqueritoid,
            descricao,
            quantidade: quantidade ?? null,
            dataPrazo: dataPrazo ?? null,
          } as never,
        },
      })

      const transicao = await applyAtividadeTransicao({
        tx,
        atividade: {
          id: created.id,
          descricao: created.descricao,
          dataRealizacao: created.dataRealizacao,
        },
        inquerito: {
          id: inquerito.id,
          estadoId: inquerito.estado.id,
          estado: inquerito.estado,
        },
        utilizadorId: session.user.id,
        req,
      })

      return { atividade: created, transicao }
    })

    // Notify the inspetor about the new activity (fire-and-forget).
    notifyAtividadeAdicionada({
      inqueritoid,
      nuipc: inquerito.nuipc,
      inspetorId: inquerito.inspetorId,
      inspetorEmail: inquerito.inspetor?.email ?? null,
      inspetorNome: inquerito.inspetor?.nome ?? null,
      addedByUserId: session.user.id,
    }).catch(() => {})

    // If the inquérito transitioned, the detail page caches need to refresh.
    if (transicao.applied) {
      revalidatePath('/inqueritos')
      revalidatePath(`/inqueritos/${nuipcToSlug(inquerito.nuipc)}`)
      revalidatePath('/dashboard')
    }

    return Response.json({ atividade, transicao }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
