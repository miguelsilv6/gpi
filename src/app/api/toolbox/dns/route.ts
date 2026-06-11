import { NextRequest } from 'next/server'
import { promises as dns } from 'node:dns'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const DOMAIN_RE = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))+$/
const IP_RE = /^[0-9a-fA-F:.]+$/

const schema = z.object({
  query: z.string().min(3).max(255),
})

async function safeResolve<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

/**
 * Lookup DNS de um domínio (A/AAAA/MX/NS/TXT/CNAME) ou reverse DNS de um IP.
 * Usa o resolver do sistema (node:dns) — sem serviços externos.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloToolboxAtivo(role))) {
      return apiError('O módulo Toolbox está desativado', 503)
    }

    const limited = enforceRateLimit({
      key: `toolbox:dns:${clientFingerprint(req)}:${session.user.id}`,
      max: 30,
      windowMs: 60_000,
    })
    if (limited) return limited

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const query = parsed.data.query.trim().toLowerCase().replace(/\.$/, '')

    // Reverse DNS para IPs.
    if (IP_RE.test(query) && (query.includes(':') || /^\d/.test(query))) {
      const ptr = await safeResolve(() => dns.reverse(query))
      if (ptr === null) {
        return apiError('Reverse DNS falhou — IP inválido ou sem registo PTR', 422)
      }
      return Response.json({ tipo: 'reverse', query, ptr })
    }

    if (!DOMAIN_RE.test(query)) {
      return apiError('Domínio inválido', 400)
    }

    const [a, aaaa, mx, ns, txt, cname] = await Promise.all([
      safeResolve(() => dns.resolve4(query)),
      safeResolve(() => dns.resolve6(query)),
      safeResolve(() => dns.resolveMx(query)),
      safeResolve(() => dns.resolveNs(query)),
      safeResolve(() => dns.resolveTxt(query)),
      safeResolve(() => dns.resolveCname(query)),
    ])

    if (!a && !aaaa && !mx && !ns && !txt && !cname) {
      return apiError('Domínio não resolve — não existe ou sem acesso à rede', 422)
    }

    return Response.json({
      tipo: 'forward',
      query,
      a: a ?? [],
      aaaa: aaaa ?? [],
      mx: (mx ?? []).sort((x, y) => x.priority - y.priority),
      ns: ns ?? [],
      txt: (txt ?? []).map((parts) => parts.join('')),
      cname: cname ?? [],
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
