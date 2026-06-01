import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'
import { MATRICULA_REGEX } from '@/lib/constants'

const createSchema = z.object({
  nome: z.string().min(1).max(100),
  matricula: z.string().regex(MATRICULA_REGEX, 'Matrícula inválida — use o formato XX-XX-XX').optional().nullable(),
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

    const matriculaUpper = parsed.data.matricula ? parsed.data.matricula.toUpperCase() : null

    // Enforce uniqueness of non-null matricula (compare normalized value)
    if (matriculaUpper) {
      const existing = await prisma.viatura.findUnique({ where: { matricula: matriculaUpper } })
      if (existing) return apiError('Já existe uma viatura com esta matrícula', 409)
    }

    const viatura = await prisma.viatura.create({
      data: {
        utilizadorId: session.user.id,
        nome: parsed.data.nome,
        matricula: matriculaUpper,
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
