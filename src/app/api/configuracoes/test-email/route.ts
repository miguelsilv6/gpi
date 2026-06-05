import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { sendMail } from '@/lib/mailer'
import { writeAudit } from '@/lib/audit'
import type { Role } from '@/generated/prisma/enums'

/**
 * Envia um email de teste ao próprio administrador autenticado, para validar a
 * configuração SMTP a partir da UI. Só ADMINISTRACAO (sistema:config).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) return apiError('Sem permissão', 403)

    const to = session.user.email
    if (!to) return apiError('A sua conta não tem email associado.', 400)

    if (process.env.DISABLE_EMAIL === 'true') {
      return apiError('O envio de email está desativado (DISABLE_EMAIL).', 409)
    }

    try {
      await sendMail({
        to,
        subject: 'Email de teste — GPI',
        text:
          'Este é um email de teste enviado a partir das Configurações do GPI. ' +
          'Se o recebeu, a configuração SMTP está a funcionar.',
        html:
          '<p>Este é um <strong>email de teste</strong> enviado a partir das Configurações do GPI.</p>' +
          '<p>Se o recebeu, a configuração SMTP está a funcionar.</p>',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      return apiError(`Falha ao enviar email: ${msg}`, 502)
    }

    await writeAudit({
      req,
      acao: 'TEST_EMAIL',
      entidade: 'ConfiguracaoSistema',
      entidadeId: 'singleton',
      utilizadorId: session.user.id,
      detalhes: { to } as never,
    })

    return Response.json({ ok: true, to })
  } catch (error) {
    return handleApiError(error)
  }
}
