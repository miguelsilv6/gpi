import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { RATE_LIMITS } from '@/lib/constants'
import { writeAudit } from '@/lib/audit'
import { huntEmail, EMAIL_REGEX } from '@/lib/toolbox/emailhunter'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  email: z.string().min(3).max(254).regex(EMAIL_REGEX, 'Endereço de email inválido'),
})

const FONTE =
  'SMTP Verify, EmailRep.io, HudsonRock, ProxyNova COMB, HIBP (lista pública), Gravatar e DNS/RDAP. ' +
  'Sujeito a falsos positivos/negativos — confirme manualmente antes de incluir num relatório.'

/**
 * Pesquisa um endereço de email em múltiplas fontes OSINT públicas (técnica
 * adaptada do cb-emailhunter). Corre sempre todos os módulos disponíveis —
 * operação pesada (inclui handshake SMTP), sujeita ao limite de operações
 * pesadas, não ao limite genérico da Toolbox.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloToolboxAtivo(role))) {
      return apiError('O módulo Toolbox está desativado', 503)
    }

    const limited = enforceRateLimit({
      key: `toolbox:email-hunter:${clientFingerprint(req)}:${session.user.id}`,
      ...RATE_LIMITS.HEAVY_OPERATIONS,
    })
    if (limited) return limited

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const email = parsed.data.email.trim()
    const resultado = await huntEmail(email)

    await writeAudit({
      req,
      acao: 'TOOLBOX_EMAIL_HUNTER_SEARCH',
      entidade: 'Toolbox',
      entidadeId: email,
      utilizadorId: session.user.id,
      detalhes: {
        email,
        smtpEstado: resultado.smtp.estado,
        emailRepDisponivel: resultado.emailRep.disponivel,
        hudsonRockEncontrados: resultado.hudsonRock.encontrados,
        proxynovaTotal: resultado.breachCheck.proxynova.total,
        gravatarEncontrado: resultado.gravatar.encontrado,
      },
    })

    return Response.json({ ...resultado, fonte: FONTE })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
