import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  url: z.string().min(3).max(500),
})

/**
 * Histórico de capturas de um site na Wayback Machine (web.archive.org).
 * Mostra quando o site foi arquivado e dá links para as versões guardadas —
 * essencial para investigar conteúdo entretanto removido ou alterado.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloToolboxAtivo(role))) {
      return apiError('O módulo Toolbox está desativado', 503)
    }

    const limited = enforceRateLimit({
      key: `toolbox:wayback:${clientFingerprint(req)}:${session.user.id}`,
      max: 10,
      windowMs: 60_000,
    })
    if (limited) return limited

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    // Aceitar URL completa ou só domínio; o CDX trata da normalização.
    const alvo = parsed.data.url.trim().replace(/^https?:\/\//i, '')
    if (!/^[\w.-]+(\/.*)?$/.test(alvo)) return apiError('URL ou domínio inválido', 400)

    let rows: string[][]
    try {
      // collapse=timestamp:6 → no máximo uma captura por mês (YYYYMM).
      const cdx = new URL('https://web.archive.org/cdx/search/cdx')
      cdx.searchParams.set('url', alvo)
      cdx.searchParams.set('output', 'json')
      cdx.searchParams.set('fl', 'timestamp,original,statuscode,mimetype')
      cdx.searchParams.set('collapse', 'timestamp:6')
      cdx.searchParams.set('limit', '200')
      const res = await fetch(cdx, {
        signal: AbortSignal.timeout(20_000),
        cache: 'no-store',
      })
      if (!res.ok) return apiError('Wayback Machine indisponível (tente novamente)', 502)
      rows = await res.json()
    } catch {
      return apiError('Não foi possível contactar a Wayback Machine (timeout ou sem acesso à internet)', 502)
    }

    // Primeira linha é o cabeçalho dos campos; sem mais linhas = sem capturas.
    const capturas = (Array.isArray(rows) ? rows.slice(1) : [])
      .filter((r) => Array.isArray(r) && r.length >= 4)
      .map((r) => ({
        timestamp: r[0],
        original: r[1],
        statuscode: r[2],
        mimetype: r[3],
        url: `https://web.archive.org/web/${r[0]}/${r[1]}`,
      }))

    await writeAudit({
      req,
      acao: 'TOOLBOX_WEB_HISTORY',
      entidade: 'Toolbox',
      entidadeId: alvo.slice(0, 255),
      utilizadorId: session.user.id,
      detalhes: { alvo, capturas: capturas.length },
    })

    return Response.json({
      query: alvo,
      capturas,
      fonte: 'web.archive.org (Wayback Machine / Internet Archive)',
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
