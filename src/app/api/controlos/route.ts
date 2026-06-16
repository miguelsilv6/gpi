import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildControloWhere, buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { CONTROLO_SELECT } from '@/lib/controlos'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const PAGE_SIZE = 50

const createSchema = z.object({
  descricao: z.string().min(1, 'Descrição obrigatória').max(500),
  observacoes: z.string().max(2000).optional().nullable(),
  dataInicio: z.string().min(1, 'Data de início obrigatória').refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'Data de início inválida' },
  ),
  periodoDias: z.number().int().min(1).max(365).optional().nullable(),
  alertaDias: z.number().int().min(1).max(90).default(3),
  nuipc: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'controlo:read:own')) return apiError('Sem permissão', 403)

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const status = searchParams.get('status') // 'pendentes' | 'concluidos' | null (all)
    const criadorId = searchParams.get('criadorId')

    const scopeWhere = buildControloWhere(role, session.user.id, session.user.brigadaId ?? null)

    const statusWhere =
      status === 'pendentes'
        ? { concluidoEm: null }
        : status === 'concluidos'
          ? { concluidoEm: { not: null } }
          : {}

    const criadorWhere: Record<string, never> = {}

    const where = {
      AND: [scopeWhere, statusWhere, criadorWhere],
    }

    const [data, total] = await Promise.all([
      prisma.controlo.findMany({
        where,
        orderBy: { dataInicio: 'asc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: CONTROLO_SELECT,
      }),
      prisma.controlo.count({ where }),
    ])

    return Response.json({ items: data, total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'controlo:create')) return apiError('Sem permissão', 403)

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { descricao, observacoes, dataInicio, periodoDias, alertaDias, nuipc } = parsed.data

    // Resolve NUIPC → inquérito id (optional)
    // Uses buildInqueritoWhere to prevent IDOR: only inquiries the user can
    // legitimately access may be linked to a new controlo.
    let inqueritoid: string | null = null
    if (nuipc?.trim()) {
      const inq = await prisma.inquerito.findFirst({
        where: {
          AND: [
            { nuipc: nuipc.trim().toUpperCase() },
            { deletedAt: null },
            buildInqueritoWhere(role, session.user.id, session.user.brigadaId ?? null),
          ],
        },
        select: { id: true },
      })
      if (!inq) return apiError('Inquérito não encontrado ou sem permissão de acesso', 404)
      inqueritoid = inq.id
    }

    const dataInicioDate = new Date(dataInicio)

    const controlo = await prisma.$transaction(async (tx) => {
      const created = await tx.controlo.create({
        data: {
          descricao,
          observacoes: observacoes ?? null,
          dataInicio: dataInicioDate,
          periodoDias: periodoDias ?? null,
          alertaDias,
          inqueritoid,
          criadorId: session.user.id,
        },
      })

      // Create the first realizacao
      await tx.controloRealizacao.create({
        data: {
          controloId: created.id,
          numero: 1,
          dataEsperada: dataInicioDate,
        },
      })

      await tx.auditLog.create({
        data: {
          acao: 'CREATE_CONTROLO',
          entidade: 'Controlo',
          entidadeId: created.id,
          utilizadorId: session.user.id,
          detalhes: {
            descricao,
            dataInicio,
            periodoDias: periodoDias ?? null,
            inqueritoid,
          } as never,
        },
      })

      return tx.controlo.findUnique({
        where: { id: created.id },
        select: CONTROLO_SELECT,
      })
    })

    return Response.json(controlo, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
