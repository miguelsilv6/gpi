import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit, diff } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const updateSchema = z.object({
  nome: z.string().min(1).max(120).optional(),
  descricao: z.string().max(500).optional().nullable(),
  ordem: z.number().int().min(0).max(9999).optional(),
  ativo: z.boolean().optional(),
  comarcaId: z.string().optional().nullable(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'seccao:manage')) {
      return apiError('Sem permissão para gerir secções', 403)
    }

    const { id } = await params
    const existing = await prisma.seccao.findUnique({ where: { id } })
    if (!existing) return apiError('Secção não encontrada', 404)

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = parsed.data

    const newNome = data.nome !== undefined ? data.nome.trim() : existing.nome
    const newComarcaId = data.comarcaId !== undefined ? (data.comarcaId ?? null) : existing.comarcaId

    if (data.nome !== undefined || data.comarcaId !== undefined) {
      const collision = await prisma.seccao.findFirst({
        where: {
          nome: { equals: newNome, mode: 'insensitive' },
          comarcaId: newComarcaId,
          NOT: { id },
        },
        select: { id: true },
      })
      if (collision) return apiError('Já existe outra secção com este nome nesta comarca', 409)
      if (data.nome !== undefined) data.nome = newNome
    }

    const updated = await prisma.seccao.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.descricao !== undefined && { descricao: data.descricao?.trim() || null }),
        ...(data.ordem !== undefined && { ordem: data.ordem }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
        ...(data.comarcaId !== undefined && { comarcaId: data.comarcaId ?? null }),
      },
      include: { comarca: { select: { id: true, nome: true } } },
    })

    const changes = diff(existing, updated, ['nome', 'descricao', 'ordem', 'ativo', 'comarcaId'])
    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_SECCAO',
        entidade: 'Seccao',
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
    if (!hasPermission(role, 'seccao:manage')) {
      return apiError('Sem permissão para gerir secções', 403)
    }

    const { id } = await params
    const existing = await prisma.seccao.findUnique({ where: { id } })
    if (!existing) return apiError('Secção não encontrada', 404)

    const inUse = await prisma.inquerito.count({ where: { seccaoId: id } })
    if (inUse > 0) {
      return apiError(
        `Secção em uso em ${inUse} inquérito(s). Desative em vez de eliminar.`,
        409,
      )
    }

    await prisma.seccao.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_SECCAO',
      entidade: 'Seccao',
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
