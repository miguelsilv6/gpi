import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  query: z.string().min(3).max(255),
})

const DOMAIN_RE = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))+$/
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/

interface RdapEvent { eventAction?: string; eventDate?: string }
interface RdapEntity { roles?: string[]; vcardArray?: unknown[]; handle?: string }

/**
 * WHOIS moderno via RDAP (rdap.org redireciona para o registry correto).
 * Devolve um resumo normalizado: registrar, datas, estados e nameservers.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloToolboxAtivo(role))) {
      return apiError('O módulo Toolbox está desativado', 503)
    }

    const limited = enforceRateLimit({
      key: `toolbox:whois:${clientFingerprint(req)}:${session.user.id}`,
      max: 20,
      windowMs: 60_000,
    })
    if (limited) return limited

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const query = parsed.data.query.trim().toLowerCase().replace(/\.$/, '')
    const isIp = IPV4_RE.test(query) || query.includes(':')
    if (!isIp && !DOMAIN_RE.test(query)) {
      return apiError('Indique um domínio ou IP válido', 400)
    }

    const url = isIp
      ? `https://rdap.org/ip/${encodeURIComponent(query)}`
      : `https://rdap.org/domain/${encodeURIComponent(query)}`

    let data: Record<string, unknown>
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        cache: 'no-store',
        headers: { Accept: 'application/rdap+json, application/json' },
        redirect: 'follow',
      })
      if (res.status === 404) return apiError('Sem registo RDAP para esta consulta', 404)
      if (!res.ok) return apiError('Serviço RDAP indisponível', 502)
      data = await res.json()
    } catch {
      return apiError('Não foi possível contactar o serviço RDAP (sem acesso à internet?)', 502)
    }

    const events = (data.events as RdapEvent[] | undefined) ?? []
    const eventOf = (action: string) =>
      events.find((e) => e.eventAction === action)?.eventDate ?? null

    const entities = (data.entities as RdapEntity[] | undefined) ?? []
    const registrar = entities.find((e) => e.roles?.includes('registrar'))
    // vCard: ["vcard", [["fn", {}, "text", "Nome"], ...]]
    let registrarNome: string | null = registrar?.handle ?? null
    const vcard = registrar?.vcardArray?.[1]
    if (Array.isArray(vcard)) {
      const fn = (vcard as unknown[][]).find((entry) => entry[0] === 'fn')
      if (fn && typeof fn[3] === 'string') registrarNome = fn[3]
    }

    const nameservers = ((data.nameservers as { ldhName?: string }[] | undefined) ?? [])
      .map((n) => n.ldhName?.toLowerCase())
      .filter(Boolean)

    return Response.json({
      query,
      tipo: isIp ? 'ip' : 'domain',
      handle: data.handle ?? null,
      nome: data.ldhName ?? data.name ?? null,
      registrar: registrarNome,
      estados: data.status ?? [],
      criado: eventOf('registration'),
      atualizado: eventOf('last changed'),
      expira: eventOf('expiration'),
      nameservers,
      // Para IPs: intervalo e país do bloco.
      startAddress: data.startAddress ?? null,
      endAddress: data.endAddress ?? null,
      country: data.country ?? null,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
