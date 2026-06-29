import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, canEditInquerito, handleApiError, apiError } from '@/lib/auth-helpers'
import { slugToNuipc } from '@/lib/utils'
import { writeAudit } from '@/lib/audit'
import type { Role } from '@/generated/prisma/enums'

const bodySchema = z.object({
  meses: z.coerce.number().int().min(1, 'Meses deve ser ≥ 1').max(60, 'Máximo 60 meses'),
  despacho: z.string().max(500).optional().nullable(),
})

/**
 * Regista uma prorrogação do prazo legal de um inquérito (soma `meses` ao
 * limite). Permissão = canEditInquerito; auditado.
 */
export async function POST(
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
      select: { id: true, brigadaId: true, inspetorId: true, deletedAt: true },
    })
    if (!existing || existing.deletedAt) return apiError('Inquérito não encontrado', 404)
    if (!canEditInquerito(role, session.user.id, session.user.brigadaId, existing)) {
      return apiError('Sem permissão para editar este inquérito', 403)
    }

    const body = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const prorrogacao = await prisma.prorrogacaoInquerito.create({
      data: {
        inqueritoId: existing.id,
        meses: parsed.data.meses,
        despacho: parsed.data.despacho?.trim() || null,
        criadoPorId: session.user.id,
      },
      select: { id: true, meses: true, despacho: true, data: true },
    })

    await writeAudit({
      req,
      acao: 'CREATE_PRORROGACAO',
      entidade: 'Inquerito',
      entidadeId: existing.id,
      utilizadorId: session.user.id,
      detalhes: { prorrogacaoId: prorrogacao.id, meses: prorrogacao.meses } as never,
    })

    revalidatePath(`/inqueritos/${slug}`)
    return Response.json(prorrogacao)
  } catch (error) {
    return handleApiError(error)
  }
}
