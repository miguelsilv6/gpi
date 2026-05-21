/**
 * Rate limiter em memória — sliding window por chave.
 *
 * Caso de uso: proteger endpoints sensíveis (login, password reset, upload
 * de backup, restauro, import em massa) contra abuso ou martelagem por uma
 * sessão comprometida.
 *
 * Escolhas:
 *   - In-memory (Map) em vez de Redis/DB — o deploy actual é single-process
 *     (1 contentor Next.js). Quando passar a multi-replica, trocar por
 *     Redis-backed mantendo a mesma API.
 *   - Sliding-window com timestamps por chave — janela contínua, sem o
 *     padrão "fixed-window edge spike" (clientes não conseguem 2× max nos
 *     extremos da janela).
 *   - Sem persistência: reset em cada arranque é aceitável e até desejável
 *     (não acumulamos estado).
 *
 * Limites recomendados em `src/lib/constants.ts` (estão lá, é o caller que
 * decide).
 */

interface RateLimitState {
  /** Timestamps (ms) das hits dentro da janela mais recente. */
  hits: number[]
}

interface RateLimitConfig {
  /** Identificador único da chave (e.g. `login:ip:1.2.3.4`). */
  key: string
  /** Número máximo de hits permitidos na janela. */
  max: number
  /** Tamanho da janela em milissegundos. */
  windowMs: number
}

export interface RateLimitResult {
  /** True se o pedido é admitido (e contado). False se ultrapassou. */
  allowed: boolean
  /** Quantos pedidos ainda cabem na janela actual. */
  remaining: number
  /** Quando o limite é refrescado (ms até hits[0] expirar). */
  retryAfterMs: number
}

const buckets = new Map<string, RateLimitState>()

/**
 * Verifica e regista um hit. Se admitido, o timestamp actual é adicionado
 * à janela. Se rejeitado, NÃO é adicionado — clientes que continuam a
 * tentar dentro da janela não estendem o ban.
 */
export function checkRateLimit({ key, max, windowMs }: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs

  const state = buckets.get(key) ?? { hits: [] }
  // Drop hits fora da janela.
  state.hits = state.hits.filter((t) => t > cutoff)

  if (state.hits.length >= max) {
    // Bloqueado — calcular quando o hit mais antigo cai fora da janela.
    const oldest = state.hits[0]!
    const retryAfterMs = oldest + windowMs - now
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) }
  }

  state.hits.push(now)
  buckets.set(key, state)
  return {
    allowed: true,
    remaining: max - state.hits.length,
    retryAfterMs: 0,
  }
}

/**
 * Apaga o estado de uma chave — útil quando um pedido legítimo "consome"
 * a tentativa e queremos limpar (e.g. login bem-sucedido).
 */
export function resetRateLimit(key: string): void {
  buckets.delete(key)
}

/**
 * Para testes — limpa todo o estado em memória.
 */
export function _resetAllForTests(): void {
  buckets.clear()
}

/**
 * Helper para route handlers: devolve uma `Response` 429 se o limite foi
 * atingido; devolve `null` se o pedido pode prosseguir.
 *
 *   const limited = enforceRateLimit({ key: `login:ip:${ip}`, max: 5, windowMs: 60_000 })
 *   if (limited) return limited
 */
export function enforceRateLimit(config: RateLimitConfig): Response | null {
  const result = checkRateLimit(config)
  if (result.allowed) return null

  const retryAfterSec = Math.ceil(result.retryAfterMs / 1000)
  return new Response(
    JSON.stringify({
      error: 'Demasiados pedidos. Tenta novamente mais tarde.',
      retryAfterSeconds: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    },
  )
}

/**
 * Extrai um identificador estável do cliente para usar como prefixo da
 * chave de rate-limit. Combina IP (primeiro do x-forwarded-for) com
 * user-agent truncado para resistir a um IP partilhado por proxies.
 *
 * NUNCA confiar só no header — em produção pôr trás de proxy reverso
 * que normaliza x-forwarded-for.
 */
export function clientFingerprint(req: Request): string {
  const headers = req.headers
  const xff = headers.get('x-forwarded-for')
  const ip = xff ? xff.split(',')[0]!.trim() : (headers.get('x-real-ip') ?? 'unknown')
  return ip
}
