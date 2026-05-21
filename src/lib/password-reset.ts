import { randomBytes, createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

/**
 * Helpers de reset de password. O fluxo:
 *
 *  1. Utilizador pede reset (POST /api/auth/password-reset/request) →
 *     `requestPasswordReset` gera token de 32 bytes (base64url), grava o
 *     SHA-256 hash na BD e devolve o token em claro para enviar por email.
 *  2. Utilizador abre o link com `?token=...` (ou path `/password-reset/<token>`)
 *     e submete a nova password (POST .../confirm) →
 *     `consumePasswordReset` valida hash + expiresAt + usedAt, troca a
 *     password e marca o token como usado.
 *
 * Nunca o token em claro fica gravado em DB — comprometer o backup não
 * dá acesso retro-activo a contas. O índice é `tokenHash @unique`.
 */

const TOKEN_BYTES = 32 // ~256 bits — colisão impossível na prática
const TOKEN_TTL_MS = 60 * 60 * 1000 // 1h
const BCRYPT_ROUNDS = 12

/** Gera token em claro + hash para a BD. */
export function generateResetToken(): { token: string; tokenHash: string } {
  const buf = randomBytes(TOKEN_BYTES)
  // base64url para que possa ser embebido directamente num URL sem
  // escaping adicional.
  const token = buf.toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return { token, tokenHash }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Cria um token de reset para o email indicado. NUNCA revela se o email
 * existe — devolve sempre `null` quando o user não existe / está inactivo,
 * mas o caller deve responder 200 OK independentemente para evitar
 * enumeração de utilizadores.
 *
 * Retorna o token em claro para o caller embeber num email; o hash já
 * ficou em BD.
 */
export async function requestPasswordReset(
  email: string,
  ctx: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null },
): Promise<{ token: string; utilizadorId: string } | null> {
  const normalized = email.toLowerCase().trim()
  const utilizador = await prisma.utilizador.findUnique({
    where: { email: normalized },
    select: { id: true, ativo: true },
  })

  // Não existe ou inactivo → devolve null sem deixar trail.
  if (!utilizador || !utilizador.ativo) return null

  const { token, tokenHash } = generateResetToken()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

  await prisma.passwordResetToken.create({
    data: {
      tokenHash,
      utilizadorId: utilizador.id,
      expiresAt,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    },
  })

  return { token, utilizadorId: utilizador.id }
}

/**
 * Consome um token e troca a password do utilizador. Falhas devolvem
 * razão estruturada — o caller deve mapear para 400 com mensagem genérica
 * para não dar pistas a um atacante.
 */
export async function consumePasswordReset(
  token: string,
  newPassword: string,
): Promise<
  | { ok: true; utilizadorId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'weak_password' }
> {
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, reason: 'weak_password' }
  }

  const tokenHash = hashToken(token)
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { utilizador: { select: { id: true, ativo: true } } },
  })

  if (!record || !record.utilizador?.ativo) return { ok: false, reason: 'invalid' }
  if (record.usedAt) return { ok: false, reason: 'used' }
  if (record.expiresAt < new Date()) return { ok: false, reason: 'expired' }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

  // Tudo numa transação:
  //   1. Bump tokenVersion (invalida sessões NextAuth activas — força re-login).
  //   2. Actualiza passwordHash.
  //   3. Reset do lockout/contador de falhas.
  //   4. Marca o token como usado.
  await prisma.$transaction([
    prisma.utilizador.update({
      where: { id: record.utilizadorId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ])

  return { ok: true, utilizadorId: record.utilizadorId }
}

/**
 * Limpeza periódica — remove tokens expirados há mais de 24h. Chamada pelo
 * worker cron (não no caminho crítico).
 */
export async function cleanupExpiredResetTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const result = await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  })
  return result.count
}
