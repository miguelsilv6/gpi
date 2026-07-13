import 'server-only'
import webpush from 'web-push'
import { prisma } from '@/lib/prisma'
import { childLogger } from '@/lib/logger'

/**
 * Web Push (browser Push API) — envio de notificações push aos dispositivos
 * subscritos de um utilizador. É um canal de entrega adicional ao in-app e ao
 * email; o conteúdo é o mesmo da notificação in-app.
 *
 * Fail-safe: se as chaves VAPID não estiverem configuradas (env
 * `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`), tudo aqui é um no-op silencioso —
 * a app arranca e funciona na mesma, apenas sem push. As chaves geram-se com
 * `npx web-push generate-vapid-keys` (ou `web-push.generateVAPIDKeys()`).
 */

const log = childLogger({ subsystem: 'push' })

// Memoiza o resultado de configurar o web-push (setVapidDetails só precisa de
// correr uma vez por processo). null = ainda não avaliado.
let configured: boolean | null = null

function ensureConfigured(): boolean {
  if (configured !== null) return configured
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'
  if (publicKey && privateKey) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey)
      configured = true
    } catch (err) {
      log.warn({ err }, 'VAPID inválido — push desativado')
      configured = false
    }
  } else {
    configured = false
  }
  return configured
}

/** True quando as chaves VAPID estão presentes e válidas. */
export function isPushConfigured(): boolean {
  return ensureConfigured()
}

/** Chave pública VAPID (base64url) a entregar ao cliente para subscrever, ou null. */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null
}

export interface PushPayload {
  title: string
  body: string
  /** URL relativa a abrir no clique (ex.: /inqueritos/<slug>). */
  url?: string
  /** Agrupa/substitui notificações com a mesma tag no dispositivo. */
  tag?: string
}

/**
 * Envia uma notificação push a todos os dispositivos subscritos de um
 * utilizador. Best-effort: nunca lança. Subscrições expiradas (404/410) são
 * removidas para não voltarem a ser tentadas.
 */
export async function sendPushToUser(utilizadorId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return

  let subs: { id: string; endpoint: string; p256dh: string; auth: string }[]
  try {
    subs = await prisma.pushSubscription.findMany({
      where: { utilizadorId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })
  } catch (err) {
    log.warn({ err, utilizadorId }, 'falha a ler subscrições push')
    return
  }
  if (subs.length === 0) return

  const body = JSON.stringify(payload)
  const staleIds: string[] = []

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        )
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        // 404/410 = subscrição já não existe no serviço de push → remover.
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(s.id)
        } else {
          log.warn({ err: err instanceof Error ? err.message : err, statusCode }, 'envio push falhou')
        }
      }
    }),
  )

  if (staleIds.length > 0) {
    await prisma.pushSubscription
      .deleteMany({ where: { id: { in: staleIds } } })
      .catch(() => {})
  }
}
