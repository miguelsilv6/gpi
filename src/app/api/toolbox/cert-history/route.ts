import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const DOMAIN_RE = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.(?!-)[a-zA-Z0-9-]{1,63}(?<!-))+$/

const schema = z.object({
  domain: z.string().min(3).max(255),
})

interface CrtShEntry {
  issuer_name?: string
  common_name?: string
  name_value?: string
  not_before?: string
  not_after?: string
}

/**
 * Histórico de certificados TLS de um domínio via Certificate Transparency
 * (crt.sh). Revela subdomínios históricos e datas de emissão — útil para
 * mapear a infraestrutura passada e presente de um alvo.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloToolboxAtivo(role))) {
      return apiError('O módulo Toolbox está desativado', 503)
    }

    const limited = enforceRateLimit({
      key: `toolbox:certs:${clientFingerprint(req)}:${session.user.id}`,
      max: 10,
      windowMs: 60_000,
    })
    if (limited) return limited

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const domain = parsed.data.domain.trim().toLowerCase().replace(/\.$/, '')
    if (!DOMAIN_RE.test(domain)) return apiError('Domínio inválido', 400)

    let entries: CrtShEntry[]
    try {
      // %.domain inclui todos os subdomínios nos logs de CT.
      const res = await fetch(
        `https://crt.sh/?q=${encodeURIComponent(`%.${domain}`)}&output=json`,
        {
          signal: AbortSignal.timeout(20_000),
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        },
      )
      if (!res.ok) return apiError('Serviço crt.sh indisponível (tente novamente)', 502)
      entries = await res.json()
    } catch {
      return apiError('Não foi possível contactar o crt.sh (timeout ou sem acesso à internet)', 502)
    }

    if (!Array.isArray(entries)) {
      return apiError('Resposta inesperada do crt.sh', 502)
    }

    // Agregar por nome: primeiro/último avistamento e emissor mais recente.
    const porNome = new Map<string, { primeiraVez: string; ultimaVez: string; emissor: string }>()
    for (const e of entries) {
      if (!e || typeof e !== 'object') continue
      const nomes = (e.name_value ?? '').split('\n')
      for (const raw of nomes) {
        const nome = raw.trim().toLowerCase()
        if (!nome || nome.includes('@')) continue
        const notBefore = e.not_before ?? ''
        const atual = porNome.get(nome)
        if (!atual) {
          porNome.set(nome, {
            primeiraVez: notBefore,
            ultimaVez: notBefore,
            emissor: e.issuer_name ?? '',
          })
        } else {
          if (notBefore && (!atual.primeiraVez || notBefore < atual.primeiraVez)) atual.primeiraVez = notBefore
          if (notBefore && notBefore > atual.ultimaVez) {
            atual.ultimaVez = notBefore
            atual.emissor = e.issuer_name ?? atual.emissor
          }
        }
      }
    }

    const nomes = [...porNome.entries()]
      .map(([nome, info]) => ({ nome, ...info }))
      .sort((a, b) => (b.ultimaVez || '').localeCompare(a.ultimaVez || ''))
      .slice(0, 200)

    await writeAudit({
      req,
      acao: 'TOOLBOX_CERT_HISTORY',
      entidade: 'Toolbox',
      entidadeId: domain,
      utilizadorId: session.user.id,
      detalhes: { domain, certificados: entries.length, nomesUnicos: nomes.length },
    })

    return Response.json({
      domain,
      totalCertificados: entries.length,
      nomes,
      fonte: 'crt.sh (logs públicos de Certificate Transparency)',
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
