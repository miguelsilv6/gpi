/**
 * Cliente para o endpoint de releases do GitHub + comparação semver.
 *
 * Usado pelo job de verificação periódica em src/lib/cron.ts e pelo endpoint
 * manual POST /api/updates/check. Lê de:
 *   GITHUB_REPO   default 'miguelsilv6/gestao-projetos'
 *   GITHUB_TOKEN  opcional, eleva o rate-limit de 60 req/h para 5000
 *   UPDATES_GITHUB_API_URL  override para testes (stub do endpoint)
 */
import { childLogger } from '@/lib/logger'

const log = childLogger({ subsystem: 'updates/github' })

const DEFAULT_REPO = 'miguelsilv6/gestao-projetos'

export interface ReleaseInfo {
  tag: string         // ex: '0.2.0' (sem o prefixo 'v')
  rawTag: string      // tal como vem do GitHub, ex: 'v0.2.0'
  url: string         // html_url da release
  notes: string       // body, truncado
  publishedAt: string // ISO
}

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)$/

export function parseSemver(tag: string): [number, number, number] | null {
  const m = SEMVER_RE.exec(tag)
  if (!m) return null
  return [parseInt(m[1]!, 10), parseInt(m[2]!, 10), parseInt(m[3]!, 10)]
}

/**
 * Compara duas strings semver. Devolve >0 se a > b, <0 se a < b, 0 se iguais.
 * Strings inválidas tratam-se como 0.0.0 para que o caller possa apenas
 * filtrar com null check do parseSemver antes.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a) ?? [0, 0, 0]
  const pb = parseSemver(b) ?? [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    if (pa[i]! !== pb[i]!) return pa[i]! - pb[i]!
  }
  return 0
}

/**
 * Devolve true se `target` é estritamente maior que `current` (ambos semver).
 * Tags inválidas devolvem false (safe default).
 */
export function isNewerVersion(target: string, current: string): boolean {
  if (!parseSemver(target) || !parseSemver(current)) return false
  return compareSemver(target, current) > 0
}

interface RawRelease {
  tag_name?: string
  html_url?: string
  body?: string | null
  published_at?: string
  prerelease?: boolean
  draft?: boolean
}

/**
 * Faz GET ao endpoint /releases/latest. Devolve null quando a resposta é
 * inválida, é prerelease/draft, ou a tag não é semver — o caller deve
 * preservar o valor cacheado anterior nesses casos.
 *
 * Não lança em falhas de rede: regista no log e devolve null. O caller
 * (cron tick) faz retry no próximo intervalo.
 */
export async function fetchLatestRelease(opts?: {
  repo?: string
  token?: string
  fetchImpl?: typeof fetch
  apiUrl?: string
}): Promise<ReleaseInfo | null> {
  const repo = opts?.repo ?? process.env.GITHUB_REPO ?? DEFAULT_REPO
  const token = opts?.token ?? process.env.GITHUB_TOKEN
  const apiUrl =
    opts?.apiUrl ??
    process.env.UPDATES_GITHUB_API_URL ??
    `https://api.github.com/repos/${repo}/releases/latest`
  const f = opts?.fetchImpl ?? fetch

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await f(apiUrl, { headers })
  } catch (err) {
    log.warn({ err, apiUrl }, 'Falha de rede ao consultar GitHub Releases')
    return null
  }

  if (!res.ok) {
    log.warn(
      { status: res.status, apiUrl },
      'GitHub Releases respondeu com erro',
    )
    return null
  }

  let body: RawRelease
  try {
    body = (await res.json()) as RawRelease
  } catch (err) {
    log.warn({ err }, 'GitHub Releases devolveu JSON inválido')
    return null
  }

  if (body.prerelease || body.draft) {
    log.info({ tag: body.tag_name }, 'Ignorando prerelease/draft')
    return null
  }

  const rawTag = body.tag_name?.trim() ?? ''
  if (!rawTag) return null
  if (!parseSemver(rawTag)) {
    log.info({ rawTag }, 'Tag não-semver — ignorada')
    return null
  }
  const tag = rawTag.replace(/^v/, '')

  const notesRaw = body.body ?? ''
  const notes = notesRaw.length > 4000 ? notesRaw.slice(0, 4000) + '\n…' : notesRaw

  return {
    tag,
    rawTag,
    url: body.html_url ?? `https://github.com/${repo}/releases/tag/${rawTag}`,
    notes,
    publishedAt: body.published_at ?? new Date().toISOString(),
  }
}
