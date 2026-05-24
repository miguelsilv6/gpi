import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requestPasswordReset } from '@/lib/password-reset'
import { sendMail } from '@/lib/mailer'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { RATE_LIMITS } from '@/lib/constants'
import { writeAudit } from '@/lib/audit'
import { getRequestInfo } from '@/lib/request-info'
import { getBrand } from '@/lib/brand'

const bodySchema = z.object({
  email: z.string().email('Email inválido'),
})

/**
 * POST /api/auth/password-reset/request
 *
 * Inicia o fluxo de reset. Resposta sempre 200 (a menos que rate-limit),
 * mesmo quando o email não existe — defesa contra enumeração de
 * utilizadores. Auditamos para visibilidade interna.
 */
export async function POST(req: NextRequest) {
  // Rate-limit ANTES de qualquer DB lookup para minimizar superfície de
  // ataque (não gastar I/O em pedidos abusivos).
  const limited = enforceRateLimit({
    key: `password-reset:request:${clientFingerprint(req)}`,
    ...RATE_LIMITS.PASSWORD_RESET_REQUEST,
  })
  if (limited) return limited

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Email inválido' }, { status: 400 })
  }

  const { email } = parsed.data
  const info = getRequestInfo(req)

  const result = await requestPasswordReset(email, info)

  if (result) {
    // Enviar email com o link de reset. Falhas SMTP são logged mas não
    // viram 500 — não queremos dar pista de que o email existe.
    const resetUrl = `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/password-reset/${result.token}`
    const brand = await getBrand()
    try {
      await sendMail({
        to: email.toLowerCase().trim(),
        subject: `[${brand.appShortName}] Pedido de redefinição de password`,
        text: [
          `Recebemos um pedido para redefinir a password da conta ${brand.appName} associada a este email.`,
          '',
          'Para definir uma nova password, abre o link abaixo (válido durante 1 hora):',
          '',
          resetUrl,
          '',
          'Se não foste tu, ignora este email — a tua password permanece inalterada.',
          '',
          `— ${brand.appName}`,
        ].join('\n'),
      })
    } catch (err) {
      console.error('[password-reset] sendMail falhou:', err)
    }

    // Audit: regista que o token foi emitido (sem o valor — esse só está
    // no email do utilizador). Permite investigar abuso.
    try {
      await writeAudit({
        req,
        acao: 'PASSWORD_RESET_REQUESTED',
        entidade: 'Utilizador',
        entidadeId: result.utilizadorId,
        utilizadorId: result.utilizadorId,
        detalhes: { source: 'self_service' },
      })
    } catch {
      // não bloquear o flow se audit falhar
    }
  }

  // Resposta neutra — o front-end mostra sempre a mesma mensagem.
  return Response.json({ ok: true })
}
