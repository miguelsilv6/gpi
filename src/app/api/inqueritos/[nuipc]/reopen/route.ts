import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { slugToNuipc } from '@/lib/utils'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  motivo: z.string().min(10, 'Motivo da reabertura é obrigatório (mín. 10 caracteres)').max(2000),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:reopen')) {
      return apiError('Sem permissão para reabrir inquéritos', 403)
    }

    const body = await req.json().catch(() => ({}))
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)

    const existing = await prisma.inquerito.findUnique({ where: { nuipc } })
    if (!existing || existing.deletedAt) return apiError('Inquérito não encontrado', 404)

    if (existing.estado !== 'CONCLUIDO' && existing.estado !== 'ARQUIVADO') {
      return apiError('Apenas inquéritos concluídos ou arquivados podem ser reabertos', 409)
    }

    const updated = await prisma.inquerito.update({
      where: { nuipc },
      data: {
        estado: 'EM_INVESTIGACAO',
        dataConclusao: null,
      },
    })

    await writeAudit({
      req,
      acao: 'REOPEN_INQUERITO',
      entidade: 'Inquerito',
      entidadeId: updated.id,
      utilizadorId: session.user.id,
      detalhes: {
        estadoAnterior: existing.estado,
        estadoNovo: updated.estado,
        motivo: parsed.data.motivo,
      },
    })

    revalidatePath('/inqueritos')
    revalidatePath(`/inqueritos/${slug}`)
    revalidatePath('/dashboard')

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
