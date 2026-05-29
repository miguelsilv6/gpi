import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit, diff } from '@/lib/audit'
import { ESTADO_COR_OPTIONS } from '@/lib/constants'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const updateSchema = z.object({
  nome: z.string().min(1).max(120).optional(),
  descricao: z.string().max(500).optional().nullable(),
  cor: z.enum(ESTADO_COR_OPTIONS as [string, ...string[]]).optional().nullable(),
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
    if (!hasPermission(role, 'etiqueta:manage')) {
      return apiError('Sem permissão para gerir etiquetas', 403)
    }

    const { id } = await params
    const existing = await prisma.etiqueta.findUnique({ where: { id } })
    if (!existing) return apiError('Etiqueta não encontrada', 404)

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = parsed.data

    // Refuse a rename collision against another etiqueta
    if (data.nome !== undefined) {
      const nome = data.nome.trim()
      const collision = await prisma.etiqueta.findFirst({
        where: {
          nome: { equals: nome, mode: 'insensitive' },
          NOT: { id },
        },
        select: { id: true },
      })
      if (collision) return apiError('Já existe outra etiqueta com este nome', 409)
      data.nome = nome
    }

    const updated = await prisma.etiqueta.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.descricao !== undefined && { descricao: data.descricao?.trim() || null }),
        ...(data.cor !== undefined && { cor: data.cor ?? null }),
        ...(data.ordem !== undefined && { ordem: data.ordem }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
    })

    const changes = diff(existing, updated, ['nome', 'descricao', 'cor', 'ordem', 'ativo'])
    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_ETIQUETA',
        entidade: 'Etiqueta',
        entidadeId: updated.id,
        utilizadorId: session.user.id,
        detalhes: changes as never,
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
    if (!hasPermission(role, 'etiqueta:manage')) {
      return apiError('Sem permissão para gerir etiquetas', 403)
    }

    const { id } = await params
    const existing = await prisma.etiqueta.findUnique({ where: { id } })
    if (!existing) return apiError('Etiqueta não encontrada', 404)

    const inUse = await prisma.inquerito.count({ where: { etiquetas: { some: { id } } } })
    if (inUse > 0) {
      return apiError(
        `Etiqueta em uso em ${inUse} inquérito(s). Desative em vez de eliminar.`,
        409,
      )
    }

    await prisma.etiqueta.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_ETIQUETA',
      entidade: 'Etiqueta',
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
