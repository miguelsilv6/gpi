import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { slugToNuipc } from '@/lib/utils'
import { tarefaCreateSchema } from '@/lib/validations/tarefa-inquerito'
import type { Role } from '@/generated/prisma/enums'

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

async function findInqueritoWithAccess(nuipc: string, role: Role, userId: string, brigadaId: string | null) {
  return prisma.inquerito.findFirst({
    where: {
      AND: [
        { nuipc },
        { deletedAt: null },
        buildInqueritoWhere(role, userId, brigadaId),
      ],
    },
    select: { id: true, nuipc: true },
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)

    const inquerito = await findInqueritoWithAccess(nuipc, role, session.user.id, session.user.brigadaId ?? null)
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    const tarefas = await prisma.tarefaInquerito.findMany({
      where: { inqueritoId: inquerito.id, autorId: session.user.id },
      orderBy: [{ concluida: 'asc' }, { prioridade: 'desc' }, { createdAt: 'desc' }],
      select: TAREFA_SELECT,
    })
    return Response.json({ items: tarefas })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)

    const inquerito = await findInqueritoWithAccess(nuipc, role, session.user.id, session.user.brigadaId ?? null)
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    if (role === 'ESTATISTICA') return apiError('Sem permissão para criar tarefas', 403)

    const limited = enforceRateLimit({
      key: `tarefa:create:${clientFingerprint(req)}:${session.user.id}`,
      max: 60,
      windowMs: 5 * 60_000,
    })
    if (limited) return limited

    const body = await req.json().catch(() => null)
    const parsed = tarefaCreateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)

    const tarefa = await prisma.tarefaInquerito.create({
      data: {
        titulo: parsed.data.titulo,
        descricao: parsed.data.descricao ?? null,
        prioridade: parsed.data.prioridade,
        inqueritoId: inquerito.id,
        autorId: session.user.id,
      },
      select: TAREFA_SELECT,
    })

    await writeAudit({
      req,
      acao: 'CREATE_TAREFA_INQUERITO',
      entidade: 'TarefaInquerito',
      entidadeId: tarefa.id,
      utilizadorId: session.user.id,
      detalhes: { nuipc: inquerito.nuipc, titulo: parsed.data.titulo },
    }).catch(() => {})

    return Response.json(tarefa, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
