import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  ip: z.string().min(3).max(45).regex(
    /^[0-9a-fA-F:.]+$/,
    'Endereço IP inválido',
  ),
})

// Campos pedidos ao ip-api.com — inclui deteção de proxy/VPN e hosting.
const FIELDS =
  'status,message,query,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting'

/**
 * Lookup de um IP: geolocalização, ASN/ISP, reverse DNS e flags de
 * proxy/VPN/hosting. Usa o serviço gratuito ip-api.com (HTTP, sem chave).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloToolboxAtivo(role))) {
      return apiError('O módulo Toolbox está desativado', 503)
    }

    const limited = enforceRateLimit({
      key: `toolbox:ip:${clientFingerprint(req)}:${session.user.id}`,
      max: 30,
      windowMs: 60_000,
    })
    if (limited) return limited

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const ip = parsed.data.ip.trim()

    let data: Record<string, unknown>
    try {
      const res = await fetch(
        `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${FIELDS}&lang=pt`,
        { signal: AbortSignal.timeout(10_000), cache: 'no-store' },
      )
      if (!res.ok) return apiError('Serviço de lookup indisponível', 502)
      data = await res.json()
    } catch {
      return apiError('Não foi possível contactar o serviço de lookup (sem acesso à internet?)', 502)
    }

    if (data.status !== 'success') {
      return apiError(`Lookup falhou: ${data.message ?? 'IP inválido ou reservado'}`, 422)
    }

    await writeAudit({
      req,
      acao: 'TOOLBOX_IP_LOOKUP',
      entidade: 'Toolbox',
      entidadeId: ip,
      utilizadorId: session.user.id,
      detalhes: { ip },
    })

    return Response.json(data)
  } catch (error) {
    return handleApiError(error)
  }
}
