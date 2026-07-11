import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit, diff } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const updateSchema = z.object({
  nome: z.string().min(1).max(200).optional(),
  ordem: z.number().int().min(0).max(9999).optional(),
  ativo: z.boolean().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'comarca:manage')) {
      return apiError('Sem permissão para gerir comarcas', 403)
    }

    const { id } = await params
    const existing = await prisma.comarca.findUnique({ where: { id } })
    if (!existing) return apiError('Comarca não encontrada', 404)

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = parsed.data

    if (data.nome !== undefined) {
      const nome = data.nome.trim()
      const collision = await prisma.comarca.findFirst({
        where: { nome: { equals: nome, mode: 'insensitive' }, NOT: { id } },
        select: { id: true },
      })
      if (collision) return apiError('Já existe outra comarca com este nome', 409)
      data.nome = nome
    }

    const updated = await prisma.comarca.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.ordem !== undefined && { ordem: data.ordem }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
      include: { _count: { select: { tribunais: true } } },
    })

    const changes = diff(existing, updated, ['nome', 'ordem', 'ativo'])
    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_COMARCA',
        entidade: 'Comarca',
        entidadeId: updated.id,
        utilizadorId: session.user.id,
        detalhes: changes,
      })
    }

    revalidatePath('/configuracoes')
    revalidatePath('/inqueritos')

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
    if (!hasPermission(role, 'comarca:manage')) {
      return apiError('Sem permissão para gerir comarcas', 403)
    }

    const { id } = await params
    const existing = await prisma.comarca.findUnique({ where: { id } })
    if (!existing) return apiError('Comarca não encontrada', 404)

    const inUse = await prisma.tribunal.count({ where: { comarcaId: id } })
    if (inUse > 0) {
      return apiError(
        `Comarca em uso em ${inUse} tribunal(ais). Mova os tribunais ou desative a comarca.`,
        409,
      )
    }

    await prisma.comarca.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_COMARCA',
      entidade: 'Comarca',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { nome: existing.nome },
    })

    revalidatePath('/configuracoes')
    revalidatePath('/inqueritos')

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
