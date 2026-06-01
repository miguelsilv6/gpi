import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const createSchema = z.object({
  nome: z.string().min(1).max(100),
  matricula: z.string().max(20).optional().nullable(),
})

export async function GET() {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'ajudas:own')) return apiError('Sem permissão', 403)

    const viaturas = await prisma.viatura.findMany({
      where: { utilizadorId: session.user.id, ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, matricula: true },
    })
    return Response.json(viaturas)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'ajudas:own')) return apiError('Sem permissão', 403)

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)

    const viatura = await prisma.viatura.create({
      data: {
        utilizadorId: session.user.id,
        nome: parsed.data.nome,
        matricula: parsed.data.matricula ?? null,
      },
      select: { id: true, nome: true, matricula: true },
    })

    await writeAudit({
      req,
      acao: 'CREATE_VIATURA',
      entidade: 'Viatura',
      entidadeId: viatura.id,
      utilizadorId: session.user.id,
    })

    return Response.json(viatura, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
