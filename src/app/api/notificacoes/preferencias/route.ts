import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { NOTIFICATION_TIPO_HAS_NATURAL } from '@/lib/notification-labels'
import { TipoNotificacao } from '@/generated/prisma/enums'
import { z } from 'zod'

/**
 * Preferências de email do próprio utilizador, por tipo de notificação.
 * Só expomos os tipos com destinatário "natural" (notificações operacionais
 * dirigidas ao utilizador) — os tipos de sistema (backup/atualização) são
 * geridos só pela policy global do admin.
 */
const USER_FACING_TIPOS = Object.values(TipoNotificacao).filter(
  (t) => NOTIFICATION_TIPO_HAS_NATURAL[t],
)

const putSchema = z.object({
  preferencias: z
    .array(
      z.object({
        tipo: z.enum(USER_FACING_TIPOS as [string, ...string[]]),
        emailEnabled: z.boolean(),
      }),
    )
    .max(USER_FACING_TIPOS.length),
})

export async function GET() {
  try {
    const session = await getSession()
    const rows = await prisma.notificacaoPreferencia.findMany({
      where: { utilizadorId: session.user.id },
      select: { tipo: true, emailEnabled: true },
    })
    const byTipo = new Map(rows.map((r) => [r.tipo, r.emailEnabled]))
    // Ausência de linha = ativo (default on).
    const preferencias = USER_FACING_TIPOS.map((tipo) => ({
      tipo,
      emailEnabled: byTipo.get(tipo) ?? true,
    }))
    return Response.json({ preferencias })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession()
    const body = await req.json()
    const parsed = putSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const userId = session.user.id
    const optOuts = parsed.data.preferencias.filter((p) => !p.emailEnabled)

    await prisma.$transaction([
      prisma.notificacaoPreferencia.deleteMany({
        where: {
          utilizadorId: userId,
          tipo: { in: parsed.data.preferencias.map((p) => p.tipo as TipoNotificacao) },
        },
      }),
      prisma.notificacaoPreferencia.createMany({
        data: optOuts.map((p) => ({
          utilizadorId: userId,
          tipo: p.tipo as TipoNotificacao,
          emailEnabled: false,
        })),
      }),
    ])

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
