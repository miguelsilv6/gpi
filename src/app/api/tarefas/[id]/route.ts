import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { tarefaUpdateSchema } from '@/lib/validations/tarefa-inquerito'

const TAREFA_SELECT = {
  id: true,
  titulo: true,
  descricao: true,
  prioridade: true,
  concluida: true,
  concluidaEm: true,
  createdAt: true,
  updatedAt: true,
  autorId: true,
} as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const { id } = await params

    const tarefa = await prisma.tarefaInquerito.findFirst({
      where: { id },
      select: { autorId: true, concluida: true, inquerito: { select: { nuipc: true } } },
    })
    if (!tarefa) return apiError('Tarefa não encontrada', 404)
    if (tarefa.autorId !== session.user.id) return apiError('Sem permissão para editar esta tarefa', 403)

    const limited = enforceRateLimit({
      key: `tarefa:update:${clientFingerprint(req)}:${session.user.id}`,
      max: 120,
      windowMs: 5 * 60_000,
    })
    if (limited) return limited

    const body = await req.json().catch(() => null)
    const parsed = tarefaUpdateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)

    const d = parsed.data
    const nowConcluida = d.concluida ?? tarefa.concluida
    const updated = await prisma.tarefaInquerito.update({
      where: { id },
      data: {
        ...(d.titulo !== undefined ? { titulo: d.titulo } : {}),
        ...(d.descricao !== undefined ? { descricao: d.descricao } : {}),
        ...(d.prioridade !== undefined ? { prioridade: d.prioridade } : {}),
        ...(d.concluida !== undefined ? {
          concluida: d.concluida,
          concluidaEm: d.concluida ? new Date() : null,
        } : {}),
      },
      select: TAREFA_SELECT,
    })

    if (d.concluida !== undefined && d.concluida !== tarefa.concluida) {
      await writeAudit({
        req,
        acao: nowConcluida ? 'COMPLETE_TAREFA_INQUERITO' : 'REOPEN_TAREFA_INQUERITO',
        entidade: 'TarefaInquerito',
        entidadeId: id,
        utilizadorId: session.user.id,
        detalhes: { nuipc: tarefa.inquerito.nuipc },
      }).catch(() => {})
    }

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const { id } = await params

    const tarefa = await prisma.tarefaInquerito.findFirst({
      where: { id },
      select: { autorId: true, inquerito: { select: { nuipc: true } } },
    })
    if (!tarefa) return apiError('Tarefa não encontrada', 404)
    if (tarefa.autorId !== session.user.id) return apiError('Sem permissão para eliminar esta tarefa', 403)

    await prisma.tarefaInquerito.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_TAREFA_INQUERITO',
      entidade: 'TarefaInquerito',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { nuipc: tarefa.inquerito.nuipc },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
