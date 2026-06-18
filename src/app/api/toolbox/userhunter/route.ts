import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { RATE_LIMITS } from '@/lib/constants'
import { writeAudit } from '@/lib/audit'
import { searchUsername, USERNAME_REGEX } from '@/lib/toolbox/userhunter'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  username: z
    .string()
    .min(1)
    .max(64)
    .regex(USERNAME_REGEX, 'Username inválido — use apenas letras, números, "." "_" "-"'),
})

const FONTE =
  'Verificação automática de presença de perfil em plataformas públicas (HTTP). ' +
  'Sujeito a falsos positivos/negativos — confirme manualmente antes de incluir num relatório.'

/**
 * Pesquisa um username em 70+ plataformas públicas (técnica de username
 * enumeration, adaptada do cb-userhunter). Operação pesada — sujeita ao
 * limite de operações pesadas, não ao limite genérico da Toolbox.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloToolboxAtivo(role))) {
      return apiError('O módulo Toolbox está desativado', 503)
    }

    const limited = enforceRateLimit({
      key: `toolbox:userhunter:${clientFingerprint(req)}:${session.user.id}`,
      ...RATE_LIMITS.HEAVY_OPERATIONS,
    })
    if (limited) return limited

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const username = parsed.data.username.trim()
    const resultado = await searchUsername(username)

    await writeAudit({
      req,
      acao: 'TOOLBOX_USERHUNTER_SEARCH',
      entidade: 'Toolbox',
      entidadeId: username,
      utilizadorId: session.user.id,
      detalhes: {
        username,
        encontrados: resultado.encontrados.length,
        plataformasAnalisadas: resultado.plataformasAnalisadas,
      },
    })

    return Response.json({
      username,
      plataformasAnalisadas: resultado.plataformasAnalisadas,
      encontrados: resultado.encontrados,
      elapsedMs: resultado.elapsedMs,
      fonte: FONTE,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
