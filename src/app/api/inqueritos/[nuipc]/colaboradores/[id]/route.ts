import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { canManageColaboradores } from '@/lib/colaboradores'
import { writeAudit } from '@/lib/audit'
import { slugToNuipc } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Revoga uma autorização de colaboração. Só titular/hierarquia. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const brigadaId = session.user.brigadaId ?? null
    const { nuipc: slug, id } = await params
    const nuipc = slugToNuipc(slug)

    const inquerito = await prisma.inquerito.findFirst({
      where: {
        AND: [{ nuipc }, { deletedAt: null }, buildInqueritoWhere(role, session.user.id, brigadaId)],
      },
      select: { id: true, nuipc: true, inspetorId: true, brigadaId: true },
    })
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    if (!canManageColaboradores(role, session.user.id, brigadaId, inquerito)) {
      return apiError('Sem permissão para revogar colaboradores neste inquérito', 403)
    }

    // Re-verifica a posse: a autorização tem de pertencer a ESTE inquérito
    // (evita revogar via id cruzado de outro inquérito).
    const colaborador = await prisma.inqueritoColaborador.findFirst({
      where: { id, inqueritoid: inquerito.id },
      select: { id: true, colaborador: { select: { nome: true, email: true } } },
    })
    if (!colaborador) return apiError('Autorização não encontrada', 404)

    await prisma.inqueritoColaborador.delete({ where: { id: colaborador.id } })

    await writeAudit({
      req,
      acao: 'DELETE_INQUERITO_COLABORADOR',
      entidade: 'InqueritoColaborador',
      entidadeId: colaborador.id,
      utilizadorId: session.user.id,
      detalhes: {
        nuipc: inquerito.nuipc,
        colaboradorNome: colaborador.colaborador.nome,
        colaboradorEmail: colaborador.colaborador.email,
      },
    }).catch(() => {})

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
