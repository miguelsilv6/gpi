import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { checkPermission, handleApiError, apiError } from '@/lib/auth-helpers'
import { notifyInqueritoTransferido } from '@/lib/notifications'
import { nuipcToSlug } from '@/lib/utils'
import { z } from 'zod'

const schema = z.object({
  nuipc: z.string().min(1),
  brigadaId: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const session = await checkPermission('inquerito:transfer')
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { nuipc, brigadaId } = parsed.data

    const inquerito = await prisma.inquerito.findUnique({ where: { nuipc } })
    if (!inquerito || inquerito.deletedAt) return apiError('Inquérito não encontrado', 404)

    if (inquerito.brigadaId === brigadaId) {
      return apiError('Brigada destino é igual à actual', 409)
    }

    if (inquerito.estado === 'ARQUIVADO') {
      return apiError('Inquérito arquivado não pode ser transferido', 409)
    }

    const brigadaDestino = await prisma.brigada.findUnique({
      where: { id: brigadaId },
      select: { id: true, nome: true, ativa: true },
    })
    if (!brigadaDestino) return apiError('Brigada não encontrada', 404)
    if (!brigadaDestino.ativa) return apiError('Brigada destino não está activa', 409)

    const brigadaOrigem = await prisma.brigada.findUnique({
      where: { id: inquerito.brigadaId },
      select: { nome: true },
    })

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.inquerito.update({
        where: { nuipc },
        data: { brigadaId, inspetorId: null },
      })
      await tx.auditLog.create({
        data: {
          acao: 'TRANSFER_INQUERITO',
          entidade: 'Inquerito',
          entidadeId: u.id,
          utilizadorId: session.user.id,
          // IP/UA captured below via writeAudit-style fields directly:
          // (we use tx.create here, so we inline the request info)
          ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null,
          userAgent: req.headers.get('user-agent') ?? null,
          detalhes: {
            from: { brigadaId: inquerito.brigadaId, nome: brigadaOrigem?.nome ?? null },
            to: { brigadaId, nome: brigadaDestino.nome },
            inspetorRemovido: inquerito.inspetorId,
          } as never,
        },
      })
      return u
    })

    // Notify brigade chiefs (outside the transaction)
    const [chefeOrigem, chefeDestino] = await Promise.all([
      prisma.utilizador.findFirst({
        where: { brigadaId: inquerito.brigadaId, role: 'INSPETOR_CHEFE', ativo: true },
        select: { id: true, email: true },
      }),
      prisma.utilizador.findFirst({
        where: { brigadaId, role: 'INSPETOR_CHEFE', ativo: true },
        select: { id: true, email: true },
      }),
    ])

    notifyInqueritoTransferido({
      inqueritoid: updated.id,
      nuipc: updated.nuipc,
      brigadaOrigemChefeId: chefeOrigem?.id ?? null,
      brigadaOrigemChefeEmail: chefeOrigem?.email ?? null,
      brigadaDestinoChefeId: chefeDestino?.id ?? null,
      brigadaDestinoChefeEmail: chefeDestino?.email ?? null,
    }).catch(() => {})

    revalidatePath('/inqueritos')
    revalidatePath(`/inqueritos/${nuipcToSlug(nuipc)}`)
    revalidatePath('/dashboard')

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

