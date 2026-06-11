import { NextRequest } from 'next/server'
import { promises as dns } from 'node:dns'
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

interface IpwhoisResponse {
  success: boolean
  message?: string
  ip?: string
  type?: string
  continent?: string
  country?: string
  country_code?: string
  region?: string
  city?: string
  postal?: string
  latitude?: number
  longitude?: number
  connection?: { asn?: number; org?: string; isp?: string; domain?: string }
  timezone?: { id?: string }
}

/**
 * Lookup de um IP: geolocalização, ASN/ISP e reverse DNS.
 * Geolocalização via ipwho.is (HTTPS, gratuito, sem chave — o ip-api.com
 * gratuito só responde por HTTP, inaceitável para OPSEC). Reverse DNS é
 * resolvido localmente pelo servidor (node:dns).
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

    let data: IpwhoisResponse
    try {
      const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      })
      if (!res.ok) return apiError('Serviço de lookup indisponível', 502)
      data = await res.json()
    } catch {
      return apiError('Não foi possível contactar o serviço de lookup (sem acesso à internet?)', 502)
    }

    if (!data.success) {
      return apiError(`Lookup falhou: ${data.message ?? 'IP inválido ou reservado'}`, 422)
    }

    // Reverse DNS local — sem dependência de serviço externo.
    let reverse = ''
    try {
      const ptr = await dns.reverse(ip)
      reverse = ptr.join(', ')
    } catch {
      // sem registo PTR — campo fica vazio
    }

    await writeAudit({
      req,
      acao: 'TOOLBOX_IP_LOOKUP',
      entidade: 'Toolbox',
      entidadeId: ip,
      utilizadorId: session.user.id,
      detalhes: { ip },
    })

    return Response.json({
      query: data.ip ?? ip,
      tipo: data.type ?? '',
      country: data.country ?? '',
      countryCode: data.country_code ?? '',
      continent: data.continent ?? '',
      regionName: data.region ?? '',
      city: data.city ?? '',
      zip: data.postal ?? '',
      lat: data.latitude ?? null,
      lon: data.longitude ?? null,
      timezone: data.timezone?.id ?? '',
      isp: data.connection?.isp ?? '',
      org: data.connection?.org ?? '',
      asn: data.connection?.asn ? `AS${data.connection?.asn}` : '',
      asDomain: data.connection?.domain ?? '',
      reverse,
      fonte: 'ipwho.is (geolocalização) + resolver do servidor (reverse DNS)',
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
