import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit, diff } from '@/lib/audit'
import { z } from 'zod'

const updateSchema = z.object({
  nome: z.string().min(1).max(120),
})

/** Renomeia uma etiqueta pessoal. Apenas o dono pode alterar. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const { id } = await params

    const existing = await prisma.etiqueta.findUnique({ where: { id } })
    if (!existing) return apiError('Etiqueta não encontrada', 404)
    if (existing.criadoPorId !== session.user.id) {
      return apiError('Só o autor pode alterar a etiqueta', 403)
    }

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const nome = parsed.data.nome.trim()
    if (!nome) return apiError('Nome é obrigatório', 400)

    // Colisão com outra etiqueta do mesmo utilizador (case-insensitive).
    const collision = await prisma.etiqueta.findFirst({
      where: {
        criadoPorId: session.user.id,
        nome: { equals: nome, mode: 'insensitive' },
        NOT: { id },
      },
      select: { id: true },
    })
    if (collision) return apiError('Já tens outra etiqueta com este nome', 409)

    const updated = await prisma.etiqueta.update({
      where: { id },
      data: { nome },
    })

    const changes = diff(existing, updated, ['nome'])
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

    revalidatePath('/inqueritos')

    return Response.json({ id: updated.id, nome: updated.nome })
  } catch (error) {
    return handleApiError(error)
  }
}

/** Elimina uma etiqueta pessoal. Apenas o dono; bloqueada se estiver em uso. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const { id } = await params

    const existing = await prisma.etiqueta.findUnique({ where: { id } })
    if (!existing) return apiError('Etiqueta não encontrada', 404)
    if (existing.criadoPorId !== session.user.id) {
      return apiError('Só o autor pode eliminar a etiqueta', 403)
    }

    const inUse = await prisma.inquerito.count({ where: { etiquetas: { some: { id } } } })
    if (inUse > 0) {
      return apiError(`Etiqueta em uso em ${inUse} inquérito(s).`, 409)
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

    revalidatePath('/inqueritos')

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
