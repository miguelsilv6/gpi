import { NextRequest } from 'next/server'
import { z } from 'zod'
import { consumePasswordReset } from '@/lib/password-reset'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { RATE_LIMITS } from '@/lib/constants'
import { writeAudit } from '@/lib/audit'

const bodySchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, 'Password tem de ter pelo menos 8 caracteres'),
})

/**
 * POST /api/auth/password-reset/confirm
 *
 * Consome um token e troca a password. Bump implícito de tokenVersion
 * (em `consumePasswordReset`) invalida sessões NextAuth activas.
 *
 * Erros são neutros: "Pedido inválido ou expirado" para qualquer falha
 * de token, evitando feedback que ajude um atacante a refinar tentativas.
 */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit({
    key: `password-reset:confirm:${clientFingerprint(req)}`,
    ...RATE_LIMITS.PASSWORD_RESET_CONFIRM,
  })
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Pedido inválido' },
      { status: 400 },
    )
  }

  const { token, password } = parsed.data
  const result = await consumePasswordReset(token, password)

  if (!result.ok) {
    // Para "weak_password" devolvemos mensagem específica (UX legítima);
    // para qualquer falha de token devolvemos a mesma string.
    if (result.reason === 'weak_password') {
      return Response.json(
        { error: 'Password tem de ter pelo menos 8 caracteres' },
        { status: 400 },
      )
    }
    return Response.json(
      { error: 'Pedido inválido ou expirado. Solicite um novo email.' },
      { status: 400 },
    )
  }

  try {
    await writeAudit({
      req,
      acao: 'PASSWORD_RESET_COMPLETED',
      entidade: 'Utilizador',
      entidadeId: result.utilizadorId,
      utilizadorId: result.utilizadorId,
      detalhes: { source: 'self_service' },
    })
  } catch {
    // audit falha não bloqueia a resposta
  }

  return Response.json({ ok: true })
}
