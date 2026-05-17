import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).optional(),
})

export async function GET() {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!hasPermission(role, 'brigada:read')) {
      return apiError('Sem permissão', 403)
    }

    const brigadas = await prisma.brigada.findMany({
      orderBy: { nome: 'asc' },
      include: {
        _count: { select: { utilizadores: true, inqueritos: true } },
      },
    })

    return Response.json(brigadas)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!hasPermission(role, 'brigada:manage')) {
      return apiError('Sem permissão para criar brigadas', 403)
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { nome, descricao } = parsed.data

    const exists = await prisma.brigada.findFirst({ where: { nome } })
    if (exists) return apiError('Já existe uma brigada com este nome', 409)

    const brigada = await prisma.brigada.create({
      data: { nome, descricao },
    })

    await writeAudit({
      req,
      acao: 'CREATE_BRIGADA',
      entidade: 'Brigada',
      entidadeId: brigada.id,
      utilizadorId: session.user.id,
      detalhes: { nome, descricao: descricao ?? null },
    })

    return Response.json(brigada, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
