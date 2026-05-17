import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit, diff } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  nome: z.string().min(1).max(100).optional(),
  descricao: z.string().max(500).optional().nullable(),
  ativa: z.boolean().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'brigada:read')) return apiError('Sem permissão', 403)

    const { id } = await params
    const brigada = await prisma.brigada.findUnique({
      where: { id },
      include: {
        utilizadores: {
          where: { ativo: true },
          orderBy: { nome: 'asc' },
          select: { id: true, nome: true, email: true, role: true },
        },
        _count: { select: { inqueritos: true } },
      },
    })

    if (!brigada) return apiError('Brigada não encontrada', 404)
    return Response.json(brigada)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'brigada:manage')) return apiError('Sem permissão', 403)

    const { id } = await params
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const brigada = await prisma.brigada.findUnique({ where: { id } })
    if (!brigada) return apiError('Brigada não encontrada', 404)

    if (parsed.data.nome && parsed.data.nome !== brigada.nome) {
      const exists = await prisma.brigada.findFirst({ where: { nome: parsed.data.nome } })
      if (exists) return apiError('Já existe uma brigada com este nome', 409)
    }

    const updated = await prisma.brigada.update({
      where: { id },
      data: parsed.data,
    })

    const changes = diff(brigada, updated, ['nome', 'descricao', 'ativa'])
    if (changes) {
      const deactivating = parsed.data.ativa === false && brigada.ativa
      await writeAudit({
        req,
        acao: deactivating ? 'DEACTIVATE_BRIGADA' : 'UPDATE_BRIGADA',
        entidade: 'Brigada',
        entidadeId: id,
        utilizadorId: session.user.id,
        detalhes: changes as never,
      })
    }

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
    if (!hasPermission(role, 'brigada:manage')) return apiError('Sem permissão', 403)

    const { id } = await params
    const brigada = await prisma.brigada.findUnique({
      where: { id },
      include: { _count: { select: { inqueritos: true } } },
    })
    if (!brigada) return apiError('Brigada não encontrada', 404)
    if (brigada._count.inqueritos > 0) {
      return apiError('Não é possível eliminar brigada com inquéritos associados', 409)
    }

    await prisma.brigada.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_BRIGADA',
      entidade: 'Brigada',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { nome: brigada.nome },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
