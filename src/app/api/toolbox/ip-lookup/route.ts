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

interface IpapiCoResponse {
  ip?: string
  version?: string
  city?: string
  region?: string
  country_name?: string
  country_code?: string
  continent_code?: string
  postal?: string
  latitude?: number
  longitude?: number
  timezone?: string
  asn?: string
  org?: string
  /** Campos de erro */
  error?: boolean
  reason?: string
}

const CONTINENT_NAMES: Record<string, string> = {
  AF: 'África',
  AN: 'Antárctida',
  AS: 'Ásia',
  EU: 'Europa',
  NA: 'América do Norte',
  OC: 'Oceânia',
  SA: 'América do Sul',
}

/**
 * Lookup de um IP: geolocalização, ASN/ISP e reverse DNS.
 * Geolocalização via ipapi.co (HTTPS, gratuito sem chave, 1000 req/dia).
 * Reverse DNS resolvido localmente (node:dns).
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

    let data: IpapiCoResponse
    try {
      const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
        headers: { 'User-Agent': 'GPI-Toolbox/1.0' },
      })
      if (!res.ok) {
        return apiError(
          `Serviço de geolocalização indisponível (HTTP ${res.status})`,
          502,
        )
      }
      data = await res.json()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return apiError(
        `Não foi possível contactar o serviço de lookup: ${msg}`,
        502,
      )
    }

    if (data.error) {
      return apiError(`Lookup falhou: ${data.reason ?? 'IP inválido ou reservado'}`, 422)
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
      tipo: data.version ?? '',
      country: data.country_name ?? '',
      countryCode: data.country_code ?? '',
      continent: CONTINENT_NAMES[data.continent_code ?? ''] ?? data.continent_code ?? '',
      regionName: data.region ?? '',
      city: data.city ?? '',
      zip: data.postal ?? '',
      lat: data.latitude ?? null,
      lon: data.longitude ?? null,
      timezone: data.timezone ?? '',
      isp: data.org ?? '',
      org: data.org ?? '',
      asn: data.asn ?? '',
      asDomain: '',
      reverse,
      fonte: 'ipapi.co (geolocalização) + resolver do servidor (reverse DNS)',
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
