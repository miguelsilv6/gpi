/**
 * Análise de cabeçalhos de email (raw headers → estrutura legível).
 * Função pura, sem dependências externas — testável em unit tests.
 *
 * Extrai: cadeia de Received (com IPs e atrasos entre hops), resultados de
 * autenticação (SPF/DKIM/DMARC), e sinais de spoofing (From vs Return-Path
 * vs Reply-To).
 */

export interface ReceivedHop {
  raw: string
  from: string | null
  by: string | null
  ip: string | null
  timestamp: string | null
  /** Atraso em segundos face ao hop anterior (null no primeiro/sem datas). */
  delaySeconds: number | null
}

export interface EmailHeaderAnalysis {
  from: string | null
  replyTo: string | null
  returnPath: string | null
  to: string | null
  subject: string | null
  date: string | null
  messageId: string | null
  /** Hops por ordem cronológica (origem primeiro). */
  received: ReceivedHop[]
  /** IP de origem provável (primeiro IP público na cadeia). */
  originIp: string | null
  spf: string | null
  dkim: string | null
  dmarc: string | null
  /** Avisos heurísticos (mismatch From/Return-Path, auth falhada, etc.). */
  warnings: string[]
}

const IP_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/
const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.)/

/** Junta linhas continuadas (RFC 5322 folding) num único header lógico. */
function unfoldHeaders(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const line of lines) {
    if (line === '') break // fim dos headers (início do corpo)
    if (/^[ \t]/.test(line) && out.length > 0) {
      out[out.length - 1] += ' ' + line.trim()
    } else {
      out.push(line)
    }
  }
  return out
}

function getHeader(headers: string[], name: string): string | null {
  const lower = `${name.toLowerCase()}:`
  const match = headers.find((h) => h.toLowerCase().startsWith(lower))
  return match ? match.slice(lower.length).trim() : null
}

function getAllHeaders(headers: string[], name: string): string[] {
  const lower = `${name.toLowerCase()}:`
  return headers
    .filter((h) => h.toLowerCase().startsWith(lower))
    .map((h) => h.slice(lower.length).trim())
}

function parseReceived(value: string): Omit<ReceivedHop, 'delaySeconds'> {
  // "from X (host [ip]) by Y ...; date"
  const fromMatch = value.match(/from\s+(\S+)/i)
  const byMatch = value.match(/by\s+(\S+)/i)
  const ipMatch = value.match(IP_RE)
  const semicolonIdx = value.lastIndexOf(';')
  const dateStr = semicolonIdx >= 0 ? value.slice(semicolonIdx + 1).trim() : null
  const parsed = dateStr ? new Date(dateStr) : null
  return {
    raw: value,
    from: fromMatch?.[1] ?? null,
    by: byMatch?.[1] ?? null,
    ip: ipMatch?.[0] ?? null,
    timestamp: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
  }
}

function extractAuthResult(authResults: string[], mechanism: 'spf' | 'dkim' | 'dmarc'): string | null {
  for (const ar of authResults) {
    const m = ar.match(new RegExp(`${mechanism}=([a-z]+)`, 'i'))
    if (m) return m[1].toLowerCase()
  }
  return null
}

/** Extrai o endereço de email de um header tipo "Nome <user@dominio>". */
function extractAddress(value: string | null): string | null {
  if (!value) return null
  const angled = value.match(/<([^>]+)>/)
  if (angled) return angled[1].toLowerCase()
  const bare = value.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)
  return bare ? bare[0].toLowerCase() : null
}

function domainOf(address: string | null): string | null {
  if (!address) return null
  const at = address.lastIndexOf('@')
  return at >= 0 ? address.slice(at + 1) : null
}

export function analyzeEmailHeaders(raw: string): EmailHeaderAnalysis {
  const headers = unfoldHeaders(raw)

  const from = getHeader(headers, 'From')
  const replyTo = getHeader(headers, 'Reply-To')
  const returnPath = getHeader(headers, 'Return-Path')
  const authResults = getAllHeaders(headers, 'Authentication-Results')

  // Received headers aparecem do mais recente para o mais antigo — inverter
  // para apresentar a viagem na ordem real (origem → destino).
  const receivedRaw = getAllHeaders(headers, 'Received').reverse()
  const hops = receivedRaw.map(parseReceived)

  const received: ReceivedHop[] = hops.map((hop, i) => {
    let delaySeconds: number | null = null
    if (i > 0 && hop.timestamp && hops[i - 1].timestamp) {
      delaySeconds = Math.round(
        (new Date(hop.timestamp).getTime() - new Date(hops[i - 1].timestamp!).getTime()) / 1000,
      )
    }
    return { ...hop, delaySeconds }
  })

  const originIp =
    received.find((h) => h.ip && !PRIVATE_IP_RE.test(h.ip))?.ip ??
    received.find((h) => h.ip)?.ip ??
    null

  const spf = extractAuthResult(authResults, 'spf') ??
    (getHeader(headers, 'Received-SPF')?.split(/\s/)[0]?.toLowerCase() ?? null)
  const dkim = extractAuthResult(authResults, 'dkim')
  const dmarc = extractAuthResult(authResults, 'dmarc')

  const warnings: string[] = []
  const fromAddr = extractAddress(from)
  const returnAddr = extractAddress(returnPath)
  const replyAddr = extractAddress(replyTo)

  if (fromAddr && returnAddr && domainOf(fromAddr) !== domainOf(returnAddr)) {
    warnings.push(
      `Domínio do From (${domainOf(fromAddr)}) difere do Return-Path (${domainOf(returnAddr)}) — possível spoofing.`,
    )
  }
  if (fromAddr && replyAddr && domainOf(fromAddr) !== domainOf(replyAddr)) {
    warnings.push(
      `Reply-To (${domainOf(replyAddr)}) aponta para domínio diferente do From (${domainOf(fromAddr)}) — respostas vão para outro destino.`,
    )
  }
  if (spf === 'fail' || spf === 'softfail') warnings.push(`SPF falhou (${spf}).`)
  if (dkim === 'fail') warnings.push('DKIM falhou.')
  if (dmarc === 'fail') warnings.push('DMARC falhou.')
  if (received.length === 0) warnings.push('Sem headers Received — texto incompleto ou não é um cabeçalho de email.')
  for (const hop of received) {
    if (hop.delaySeconds != null && hop.delaySeconds > 300) {
      warnings.push(`Atraso anormal de ${Math.round(hop.delaySeconds / 60)} min num hop (${hop.by ?? '?'}).`)
    }
    if (hop.delaySeconds != null && hop.delaySeconds < -60) {
      warnings.push('Timestamps fora de ordem na cadeia Received — possível header forjado.')
    }
  }

  return {
    from,
    replyTo,
    returnPath,
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    messageId: getHeader(headers, 'Message-ID'),
    received,
    originIp,
    spf,
    dkim,
    dmarc,
    warnings,
  }
}
