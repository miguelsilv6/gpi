import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, canEditInquerito, handleApiError, apiError } from '@/lib/auth-helpers'
import { computeDocumentacaoPendenteUpdate } from '@/lib/documentacao-pendente'
import { slugToNuipc } from '@/lib/utils'
import { writeAudit } from '@/lib/audit'
import type { Role } from '@/generated/prisma/enums'

const bodySchema = z.object({
  pendente: z.boolean(),
  nota: z.string().max(2000).optional().nullable(),
})

/**
 * Toggle rápido da flag "documentação pendente" de um inquérito — usado pelo
 * detalhe do inquérito e pela página de listagem (ação "Marcar como junta"),
 * sem exigir o formulário de edição completo. Permissão = canEditInquerito.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)

    const existing = await prisma.inquerito.findUnique({
      where: { nuipc },
      select: {
        id: true,
        brigadaId: true,
        inspetorId: true,
        deletedAt: true,
        documentacaoPendente: true,
        documentacaoPendenteDesde: true,
        documentacaoPendenteNota: true,
        documentacaoPendentePorId: true,
      },
    })
    if (!existing || existing.deletedAt) return apiError('Inquérito não encontrado', 404)

    // Quem já é o dono da marca pode sempre geri-la (editar nota / resolver),
    // mesmo que entretanto tenha perdido permissão de edição do inquérito.
    // Marcar de novo (criar a entrada) continua a exigir canEditInquerito.
    const isMarker = existing.documentacaoPendentePorId === session.user.id
    if (!isMarker && !canEditInquerito(role, session.user.id, session.user.brigadaId, existing)) {
      return apiError('Sem permissão para editar este inquérito', 403)
    }

    const body = await req.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const update = computeDocumentacaoPendenteUpdate({
      pendente: parsed.data.pendente,
      nota: parsed.data.nota,
      userId: session.user.id,
      current: {
        documentacaoPendente: existing.documentacaoPendente,
        documentacaoPendenteDesde: existing.documentacaoPendenteDesde,
        documentacaoPendentePorId: existing.documentacaoPendentePorId,
      },
    })

    const updated = await prisma.inquerito.update({
      where: { id: existing.id },
      data: update,
      select: {
        id: true,
        documentacaoPendente: true,
        documentacaoPendenteNota: true,
        documentacaoPendenteDesde: true,
      },
    })

    // Só audita quando há mudança efetiva no estado ou na nota.
    const notaMudou =
      (existing.documentacaoPendenteNota ?? null) !== (updated.documentacaoPendenteNota ?? null)
    if (existing.documentacaoPendente !== updated.documentacaoPendente || notaMudou) {
      await writeAudit({
        req,
        acao: 'UPDATE_INQUERITO',
        entidade: 'Inquerito',
        entidadeId: existing.id,
        utilizadorId: session.user.id,
        detalhes: {
          documentacaoPendente: {
            de: existing.documentacaoPendente,
            para: updated.documentacaoPendente,
          },
          documentacaoPendenteNota: {
            de: existing.documentacaoPendenteNota,
            para: updated.documentacaoPendenteNota,
          },
        } as never,
      })
    }

    revalidatePath('/inqueritos')
    revalidatePath(`/inqueritos/${slug}`)
    revalidatePath('/documentacao-pendente')
    revalidatePath('/dashboard')

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
