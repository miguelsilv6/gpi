import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isPushConfigured, getVapidPublicKey } from '@/lib/push'

// web-push (via sendPushToUser) e o upsert correm em Node, não Edge.
export const runtime = 'nodejs'

/**
 * GET — estado do push para o cliente decidir se mostra o controlo de opt-in
 * e obter a chave pública VAPID para subscrever.
 */
export async function GET() {
  try {
    await getSession()
    return Response.json({ configured: isPushConfigured(), publicKey: getVapidPublicKey() })
  } catch (error) {
    return handleApiError(error)
  }
}

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(300),
  }),
})

/**
 * POST — regista (ou atualiza) a subscrição push do browser atual para o
 * utilizador em sessão. Idempotente por `endpoint` (uma linha por browser).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const body = await req.json().catch(() => ({}))
    const parsed = subscribeSchema.safeParse(body)
    if (!parsed.success) return apiError('Subscrição inválida', 400)

    const { endpoint, keys } = parsed.data
    const userAgent = req.headers.get('user-agent')?.slice(0, 300) ?? null
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, utilizadorId: session.user.id, userAgent },
      update: { p256dh: keys.p256dh, auth: keys.auth, utilizadorId: session.user.id, userAgent },
    })
    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}

const unsubscribeSchema = z.object({ endpoint: z.string().max(2000) })

/**
 * DELETE — remove a subscrição do browser atual. Só apaga linhas do próprio
 * utilizador (não se pode remover a subscrição de outrem).
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    const body = await req.json().catch(() => ({}))
    const parsed = unsubscribeSchema.safeParse(body)
    if (!parsed.success) return apiError('Pedido inválido', 400)

    await prisma.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, utilizadorId: session.user.id },
    })
    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
