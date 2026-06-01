import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const updateSchema = z.object({
  nome: z.string().min(1).max(100).optional(),
  matricula: z.string().max(20).optional().nullable(),
  ativo: z.boolean().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'ajudas:own')) return apiError('Sem permissão', 403)

    const { id } = await params

    const existing = await prisma.viatura.findUnique({ where: { id } })
    if (!existing) return apiError('Viatura não encontrada', 404)
    if (existing.utilizadorId !== session.user.id) return apiError('Sem permissão', 403)

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)

    const updated = await prisma.viatura.update({
      where: { id },
      data: parsed.data,
      select: { id: true, nome: true, matricula: true, ativo: true },
    })

    await writeAudit({
      req,
      acao: 'UPDATE_VIATURA',
      entidade: 'Viatura',
      entidadeId: id,
      utilizadorId: session.user.id,
    })

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
    if (!hasPermission(role, 'ajudas:own')) return apiError('Sem permissão', 403)

    const { id } = await params

    const existing = await prisma.viatura.findUnique({ where: { id } })
    if (!existing) return apiError('Viatura não encontrada', 404)
    if (existing.utilizadorId !== session.user.id) return apiError('Sem permissão', 403)

    const inUse = await prisma.ajudasLinha.count({ where: { viaturaId: id } })
    if (inUse > 0) return apiError('Viatura em uso em entradas de ajudas. Desative-a em vez de eliminar.', 409)

    await prisma.viatura.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_VIATURA',
      entidade: 'Viatura',
      entidadeId: id,
      utilizadorId: session.user.id,
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
