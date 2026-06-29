import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, canEditInquerito, handleApiError, apiError } from '@/lib/auth-helpers'
import { slugToNuipc } from '@/lib/utils'
import { writeAudit } from '@/lib/audit'
import type { Role } from '@/generated/prisma/enums'

/**
 * Remove uma prorrogação do prazo legal. Permissão = canEditInquerito;
 * auditado. Garante que a prorrogação pertence ao inquérito do URL.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { nuipc: slug, id } = await params
    const nuipc = slugToNuipc(slug)

    const existing = await prisma.inquerito.findUnique({
      where: { nuipc },
      select: { id: true, brigadaId: true, inspetorId: true, deletedAt: true },
    })
    if (!existing || existing.deletedAt) return apiError('Inquérito não encontrado', 404)
    if (!canEditInquerito(role, session.user.id, session.user.brigadaId, existing)) {
      return apiError('Sem permissão para editar este inquérito', 403)
    }

    const prorr = await prisma.prorrogacaoInquerito.findUnique({
      where: { id },
      select: { id: true, inqueritoId: true, meses: true },
    })
    if (!prorr || prorr.inqueritoId !== existing.id) {
      return apiError('Prorrogação não encontrada', 404)
    }

    await prisma.prorrogacaoInquerito.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_PRORROGACAO',
      entidade: 'Inquerito',
      entidadeId: existing.id,
      utilizadorId: session.user.id,
      detalhes: { prorrogacaoId: id, meses: prorr.meses } as never,
    })

    revalidatePath(`/inqueritos/${slug}`)
    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
