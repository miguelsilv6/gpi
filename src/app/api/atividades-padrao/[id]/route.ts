import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  nome: z.string().min(1).max(200).optional(),
  descricao: z.string().max(500).optional().nullable(),
  ativa: z.boolean().optional(),
  ordem: z.coerce.number().int().min(0).optional(),
  temPrazo: z.boolean().optional(),
  temQuantidade: z.boolean().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) return apiError('Sem permissão', 403)

    const { id } = await params
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const updated = await prisma.atividadePadrao.update({ where: { id }, data: parsed.data })
    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) return apiError('Sem permissão', 403)

    const { id } = await params
    await prisma.atividadePadrao.delete({ where: { id } })
    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
