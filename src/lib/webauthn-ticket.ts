import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Bilhete de sessão de uso único (HMAC) que faz a ponte entre a verificação
 * WebAuthn (feita na rota `authenticate`, com controlo total do cookie e do
 * challenge single-use) e o estabelecimento da sessão pelo Auth.js.
 *
 * Vive à parte de `webauthn.ts` (que puxa `@simplewebauthn/server`, pesado)
 * porque é importado por `auth.ts` — que por sua vez é importado por quase
 * todas as rotas. Aqui só se usa `node:crypto`.
 *
 * A rota emite o bilhete; o cliente entrega-o a `signIn('passkey', { ticket })`,
 * cujo `authorize` valida a assinatura + validade e devolve o utilizador.
 * Curto (60 s). Assinado com AUTH_SECRET — nunca sai do servidor em claro.
 */
function ticketSecret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || ''
}

export function mintWebauthnTicket(userId: string, ttlSeconds = 60): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = `${userId}.${exp}`
  const sig = createHmac('sha256', ticketSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyWebauthnTicket(ticket: string): string | null {
  const secret = ticketSecret()
  if (!secret) return null
  const parts = ticket.split('.')
  if (parts.length !== 3) return null
  const [userId, expStr, sig] = parts
  const exp = Number(expStr)
  if (!userId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null
  const expected = createHmac('sha256', secret).update(`${userId}.${exp}`).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return userId
}
