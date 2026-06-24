import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSession,
  handleApiError,
  apiError,
  buildInqueritoWhere,
  canEditInquerito,
} from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { slugToNuipc } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { nuipc: slug, id } = await params
    const nuipc = slugToNuipc(slug)
    const brigadaId = session.user.brigadaId ?? null

    const inquerito = await prisma.inquerito.findFirst({
      where: { AND: [{ nuipc }, { deletedAt: null }, buildInqueritoWhere(role, session.user.id, brigadaId)] },
      select: { id: true, nuipc: true, inspetorId: true, brigadaId: true },
    })
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    if (!canEditInquerito(role, session.user.id, brigadaId, inquerito)) {
      return apiError('Sem permissão para remover ligações', 403)
    }

    // A ligação tem de envolver este inquérito (em qualquer dos sentidos).
    const relacao = await prisma.inqueritoRelacao.findFirst({
      where: { AND: [{ id }, { OR: [{ origemId: inquerito.id }, { destinoId: inquerito.id }] }] },
      select: { id: true, origemId: true, destinoId: true },
    })
    if (!relacao) return apiError('Ligação não encontrada', 404)

    await prisma.inqueritoRelacao.delete({ where: { id: relacao.id } })

    await writeAudit({
      req,
      acao: 'DELETE_INQUERITO_RELACAO',
      entidade: 'InqueritoRelacao',
      entidadeId: relacao.id,
      utilizadorId: session.user.id,
      detalhes: { nuipc: inquerito.nuipc },
    }).catch(() => {})

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
