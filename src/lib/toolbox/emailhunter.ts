/**
 * Pesquisa de endereço de email em múltiplas fontes públicas (OSINT),
 * adaptada do projeto open-source cb-emailhunter (ciberbrigada, MIT).
 * Corre sempre todos os módulos disponíveis, em paralelo:
 *
 *  1. SMTP Verify        — handshake SMTP (HELO/MAIL/RCPT) ao MX do domínio
 *  2. EmailRep.io        — reputação, sinais de risco e perfis associados
 *  3. HudsonRock          — presença em infostealers (malware de credenciais)
 *  4. Breach Check        — ProxyNova COMB + lista pública de breaches da HIBP
 *  5. Gravatar             — perfil público associado ao hash do email
 *  6. Google Dorks         — links de pesquisa direcionada (sem pedidos HTTP)
 *  7. Domain Info          — proveedor, IP do domínio e WHOIS/RDAP quando aplicável
 *
 * Senhas devolvidas por fontes de breach são sempre mascaradas — nunca se
 * expõe a credencial em claro na resposta, no audit log ou nos exports.
 */

import { promises as dns } from 'node:dns'
import { Socket } from 'node:net'
import { createHash } from 'node:crypto'
import type { RelatorioRow } from '@/lib/relatorios/types'

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function emailDomain(email: string): string {
  return email.split('@')[1].toLowerCase()
}

function md5(value: string): string {
  return createHash('md5').update(value.toLowerCase().trim()).digest('hex')
}

/** Mascara um segredo (senha exposta em leak), mantendo só os 2 primeiros carateres. */
function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.length <= 2) return '*'.repeat(value.length)
  return value.slice(0, 2) + '*'.repeat(value.length - 2)
}

function boolLabel(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v ? 'Sim' : 'Não'
}

// ─────────────────────────────────────────────────────────────────────────
// MÓDULO 1 — SMTP Verify
// ─────────────────────────────────────────────────────────────────────────

export interface SmtpVerifyResult {
  dominio: string
  servidorMx: string
  estado: 'valido' | 'invalido' | 'indeterminado'
  detalhe: string
}

const SMTP_SERVERS_CONHECIDOS: Record<string, string> = {
  'gmail.com': 'aspmx.l.google.com',
  'googlemail.com': 'aspmx.l.google.com',
  'yahoo.com': 'mta5.am0.yahoodns.net',
  'outlook.com': 'outlook-com.olc.protection.outlook.com',
  'hotmail.com': 'outlook-com.olc.protection.outlook.com',
  'live.com': 'outlook-com.olc.protection.outlook.com',
  'protonmail.com': 'mail.protonmail.ch',
  'icloud.com': 'mx1.mail.icloud.com',
}

async function resolveSmtpServer(domain: string): Promise<string> {
  try {
    const registos = await dns.resolveMx(domain)
    if (registos.length > 0) {
      registos.sort((a, b) => a.priority - b.priority)
      return registos[0].exchange
    }
  } catch {
    // sem registos MX — usar heurísticas abaixo
  }
  return SMTP_SERVERS_CONHECIDOS[domain] ?? `mail.${domain}`
}

/** Handshake SMTP manual (HELO → MAIL FROM:<> → RCPT TO) — devolve o código final do RCPT. */
function smtpRcptCode(host: string, email: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let buf = ''
    let stage: 'banner' | 'helo' | 'mail' | 'rcpt' | 'done' = 'banner'
    let settled = false

    function finish(fn: () => void) {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      fn()
    }

    socket.setTimeout(timeoutMs)
    socket.once('timeout', () => finish(() => reject(new Error('Tempo limite excedido'))))
    socket.once('error', (err) => finish(() => reject(err)))
    socket.once('close', () => finish(() => reject(new Error('Conexão fechada pelo servidor remoto'))))

    socket.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      const lines = buf.split(/\r?\n/).filter(Boolean)
      if (lines.length === 0) return
      const ultima = lines[lines.length - 1]
      const m = /^(\d{3})([ -])/.exec(ultima)
      if (!m || m[2] !== ' ') return // linha de continuação — aguarda o resto
      const code = Number(m[1])
      buf = ''

      if (stage === 'banner') {
        stage = 'helo'
        socket.write('HELO osint-verify.local\r\n')
      } else if (stage === 'helo') {
        stage = 'mail'
        socket.write('MAIL FROM:<>\r\n')
      } else if (stage === 'mail') {
        stage = 'rcpt'
        socket.write(`RCPT TO:<${email}>\r\n`)
      } else if (stage === 'rcpt') {
        stage = 'done'
        finish(() => resolve(code))
      }
    })

    socket.connect(25, host)
  })
}

async function smtpVerify(email: string): Promise<SmtpVerifyResult> {
  const dominio = emailDomain(email)
  const servidorMx = await resolveSmtpServer(dominio)

  try {
    const code = await smtpRcptCode(servidorMx, email, 8_000)
    if (code === 250) {
      return { dominio, servidorMx, estado: 'valido', detalhe: 'O servidor de email aceitou o endereço (RCPT 250).' }
    }
    if (code === 550) {
      return { dominio, servidorMx, estado: 'invalido', detalhe: 'O servidor de email rejeitou o endereço (RCPT 550).' }
    }
    return { dominio, servidorMx, estado: 'indeterminado', detalhe: `Resposta ambígua do servidor (código ${code}).` }
  } catch {
    return {
      dominio,
      servidorMx,
      estado: 'indeterminado',
      detalhe: 'Não foi possível ligar ao servidor de email (timeout, firewall ou porta 25 bloqueada).',
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MÓDULO 2 — EmailRep.io
// ─────────────────────────────────────────────────────────────────────────

export interface EmailRepResult {
  disponivel: boolean
  reputacao: string | null
  suspeito: boolean | null
  referencias: number | null
  blacklisted: boolean | null
  atividadeMaliciosa: boolean | null
  credenciaisExpostas: boolean | null
  dataBreach: boolean | null
  primeiraVista: string | null
  ultimaVista: string | null
  spf: boolean | null
  dmarc: boolean | null
  deliverable: boolean | null
  freeProvider: boolean | null
  disposable: boolean | null
  perfis: string[]
  mensagem?: string
}

interface EmailRepApiResponse {
  reputation?: string
  suspicious?: boolean
  references?: number
  details?: {
    blacklisted?: boolean
    malicious_activity?: boolean
    credentials_leaked?: boolean
    data_breach?: boolean
    first_seen?: string
    last_seen?: string
    spf_strict?: boolean
    dmarc_enforced?: boolean
    deliverable?: boolean
    free_provider?: boolean
    disposable?: boolean
    profiles?: string[]
  }
}

async function emailRepLookup(email: string): Promise<EmailRepResult> {
  const vazio: EmailRepResult = {
    disponivel: false,
    reputacao: null,
    suspeito: null,
    referencias: null,
    blacklisted: null,
    atividadeMaliciosa: null,
    credenciaisExpostas: null,
    dataBreach: null,
    primeiraVista: null,
    ultimaVista: null,
    spf: null,
    dmarc: null,
    deliverable: null,
    freeProvider: null,
    disposable: null,
    perfis: [],
  }
  try {
    const res = await fetch(`https://emailrep.io/${encodeURIComponent(email)}`, {
      headers: { 'User-Agent': 'cb-emailhunter/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (res.status === 429) return { ...vazio, mensagem: 'Limite de pedidos do EmailRep.io atingido — tente novamente mais tarde.' }
    if (!res.ok) return { ...vazio, mensagem: `EmailRep.io respondeu com código ${res.status}.` }

    const d = (await res.json()) as EmailRepApiResponse
    const det = d.details ?? {}
    return {
      disponivel: true,
      reputacao: d.reputation ?? null,
      suspeito: d.suspicious ?? null,
      referencias: d.references ?? null,
      blacklisted: det.blacklisted ?? null,
      atividadeMaliciosa: det.malicious_activity ?? null,
      credenciaisExpostas: det.credentials_leaked ?? null,
      dataBreach: det.data_breach ?? null,
      primeiraVista: det.first_seen ?? null,
      ultimaVista: det.last_seen ?? null,
      spf: det.spf_strict ?? null,
      dmarc: det.dmarc_enforced ?? null,
      deliverable: det.deliverable ?? null,
      freeProvider: det.free_provider ?? null,
      disposable: det.disposable ?? null,
      perfis: det.profiles ?? [],
    }
  } catch {
    return { ...vazio, mensagem: 'EmailRep.io indisponível (timeout ou erro de rede).' }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MÓDULO 3 — HudsonRock (Infostealers)
// ─────────────────────────────────────────────────────────────────────────

export interface InfostealerRecord {
  data: string | null
  stealer: string | null
  os: string | null
  passwordParcial: string | null
  url: string | null
}

export interface HudsonRockResult {
  disponivel: boolean
  encontrados: number
  registos: InfostealerRecord[]
  mensagem?: string
}

interface HudsonRockApiRecord {
  date_uploaded?: string
  date?: string
  stealer_family?: string
  malware?: string
  operating_system?: string
  os?: string
  password?: string
  url?: string
}

interface HudsonRockApiResponse {
  stealers?: HudsonRockApiRecord[]
  data?: HudsonRockApiRecord[]
}

async function hudsonRockLookup(email: string): Promise<HudsonRockResult> {
  const endpoints = [
    `https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-login?login=${encodeURIComponent(email)}`,
    `https://cavalier.hudsonrock.com/api/json/v2/osint-tools/check-email?email=${encodeURIComponent(email)}`,
  ]

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/124.0.0.0 Safari/537.36', Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
        cache: 'no-store',
      })
      if (res.status === 429) {
        return { disponivel: false, encontrados: 0, registos: [], mensagem: 'Limite de pedidos do HudsonRock atingido — tente novamente mais tarde.' }
      }
      if (!res.ok) continue

      const d = (await res.json()) as HudsonRockApiResponse
      const stealers = d.stealers ?? d.data ?? []
      const registos: InfostealerRecord[] = stealers.slice(0, 5).map((s) => ({
        data: s.date_uploaded ?? s.date ?? null,
        stealer: s.stealer_family ?? s.malware ?? null,
        os: s.operating_system ?? s.os ?? null,
        passwordParcial: maskSecret(s.password),
        url: s.url ?? null,
      }))
      return { disponivel: true, encontrados: stealers.length, registos }
    } catch {
      continue
    }
  }

  return {
    disponivel: false,
    encontrados: 0,
    registos: [],
    mensagem: 'API do HudsonRock indisponível — verifique manualmente em cavalier.hudsonrock.com.',
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MÓDULO 4 — Breach Check (ProxyNova COMB + HIBP)
// ─────────────────────────────────────────────────────────────────────────

export interface DomainBreach {
  nome: string
  data: string | null
  contasComprometidas: number
  dadosExpostos: string[]
}

export interface BreachCheckResult {
  proxynova: { disponivel: boolean; total: number; amostra: string[]; mensagem?: string }
  hibp: { disponivel: boolean; breachesDominio: DomainBreach[]; mensagem?: string }
  linksManuais: { nome: string; url: string }[]
}

interface HibpBreach {
  Name?: string
  Domain?: string
  BreachDate?: string
  PwnCount?: number
  DataClasses?: string[]
}

/** Mascara a parte da senha numa linha "email:senha" do COMB. Sem separador, a linha é tratada como segredo na íntegra (nunca devolvida em claro). */
function maskLine(line: string): string {
  const idx = line.indexOf(':')
  if (idx === -1) return maskSecret(line) ?? ''
  return `${line.slice(0, idx)}:${maskSecret(line.slice(idx + 1)) ?? ''}`
}

async function breachCheckLookup(email: string): Promise<BreachCheckResult> {
  const dominio = emailDomain(email)

  const proxynova: BreachCheckResult['proxynova'] = { disponivel: false, total: 0, amostra: [] }
  try {
    const res = await fetch(
      `https://api.proxynova.com/comb?query=${encodeURIComponent(email)}&start=0&limit=10`,
      { signal: AbortSignal.timeout(12_000), cache: 'no-store' },
    )
    if (res.ok) {
      const d = (await res.json()) as { count?: number; lines?: string[] }
      proxynova.disponivel = true
      proxynova.total = d.count ?? 0
      proxynova.amostra = (d.lines ?? []).slice(0, 6).map(maskLine)
    } else {
      proxynova.mensagem = `ProxyNova respondeu com código ${res.status}.`
    }
  } catch {
    proxynova.mensagem = 'ProxyNova COMB indisponível (timeout ou erro de rede).'
  }

  const hibp: BreachCheckResult['hibp'] = { disponivel: false, breachesDominio: [] }
  try {
    const res = await fetch('https://haveibeenpwned.com/api/v3/breaches', {
      headers: { 'User-Agent': 'cb-emailhunter/1.0' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (res.ok) {
      const breaches = (await res.json()) as HibpBreach[]
      const nomeDominio = dominio.split('.')[0]
      // Nomes de breach só são comparados por substring quando o rótulo do domínio
      // tem comprimento suficiente — caso contrário ("a.io", "go.com") qualquer
      // breach cujo nome contenha essa letra/sílaba seria falsamente associado.
      const doDominio = breaches.filter(
        (b) =>
          (b.Domain ?? '').toLowerCase().includes(dominio) ||
          (nomeDominio.length >= 4 && (b.Name ?? '').toLowerCase().includes(nomeDominio)),
      )
      hibp.disponivel = true
      hibp.breachesDominio = doDominio.slice(0, 3).map((b) => ({
        nome: b.Name ?? '—',
        data: b.BreachDate ?? null,
        contasComprometidas: b.PwnCount ?? 0,
        dadosExpostos: (b.DataClasses ?? []).slice(0, 4),
      }))
    } else {
      hibp.mensagem = `HIBP respondeu com código ${res.status}.`
    }
  } catch {
    hibp.mensagem = 'HIBP indisponível (timeout ou erro de rede).'
  }

  return {
    proxynova,
    hibp,
    linksManuais: [
      { nome: 'HIBP (verificar este email)', url: `https://haveibeenpwned.com/account/${encodeURIComponent(email)}` },
      { nome: 'LeakCheck', url: `https://leakcheck.io/?query=${encodeURIComponent(email)}` },
      { nome: 'DeHashed', url: `https://dehashed.com/search?query=${encodeURIComponent(email)}` },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MÓDULO 5 — Gravatar
// ─────────────────────────────────────────────────────────────────────────

export interface GravatarResult {
  encontrado: boolean
  displayName: string | null
  username: string | null
  perfilUrl: string | null
  avatarUrl: string
  bio: string | null
  redes: { rede: string; url: string }[]
  mensagem?: string
}

interface GravatarEntry {
  displayName?: string
  preferredUsername?: string
  aboutMe?: string
  accounts?: { shortname?: string; url?: string }[]
  urls?: { value?: string }[]
}

async function gravatarLookup(email: string): Promise<GravatarResult> {
  const hash = md5(email)
  const avatarUrl = `https://www.gravatar.com/avatar/${hash}?s=200`
  try {
    const res = await fetch(`https://www.gravatar.com/${hash}.json`, {
      headers: { 'User-Agent': 'cb-emailhunter/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    })
    if (res.status === 404) {
      return { encontrado: false, displayName: null, username: null, perfilUrl: null, avatarUrl, bio: null, redes: [] }
    }
    if (!res.ok) {
      return { encontrado: false, displayName: null, username: null, perfilUrl: null, avatarUrl, bio: null, redes: [], mensagem: `Gravatar respondeu com código ${res.status}.` }
    }
    const d = (await res.json()) as { entry?: GravatarEntry[] }
    const entry = d.entry?.[0]
    if (!entry) {
      return { encontrado: false, displayName: null, username: null, perfilUrl: null, avatarUrl, bio: null, redes: [] }
    }
    const redesAccounts = (entry.accounts ?? [])
      .filter((a) => a.url)
      .map((a) => ({ rede: a.shortname ?? '?', url: a.url as string }))
    const redesUrls = (entry.urls ?? [])
      .filter((u) => u.value)
      .map((u) => ({ rede: 'URL', url: u.value as string }))
    return {
      encontrado: true,
      displayName: entry.displayName ?? null,
      username: entry.preferredUsername ?? null,
      perfilUrl: entry.preferredUsername ? `https://gravatar.com/${entry.preferredUsername}` : null,
      avatarUrl,
      bio: entry.aboutMe ? entry.aboutMe.slice(0, 200) : null,
      redes: [...redesAccounts, ...redesUrls],
    }
  } catch {
    return { encontrado: false, displayName: null, username: null, perfilUrl: null, avatarUrl, bio: null, redes: [], mensagem: 'Gravatar indisponível (timeout ou erro de rede).' }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MÓDULO 6 — Google Dorks (apenas links, sem pedidos HTTP)
// ─────────────────────────────────────────────────────────────────────────

export interface GoogleDork {
  descricao: string
  url: string
}

function googleDorks(email: string): GoogleDork[] {
  const dominio = emailDomain(email)
  const utilizador = email.split('@')[0]
  const dorks: [string, string][] = [
    [`"${email}"`, 'Email exato'],
    [`"${email}" filetype:pdf`, 'Em documentos PDF'],
    [`"${email}" site:linkedin.com`, 'LinkedIn'],
    [`"${email}" site:facebook.com`, 'Facebook'],
    [`"${email}" site:instagram.com`, 'Instagram'],
    [`"${email}" password OR leak OR breach`, 'Leaks públicos'],
    [`"${email}" CV OR curriculum OR resume`, 'Currículos'],
    [`"${utilizador}" site:${dominio}`, 'No próprio domínio'],
    [`intext:"${email}" site:pastebin.com`, 'Pastebin'],
    [`intext:"${email}" site:github.com`, 'GitHub'],
  ]
  return dorks.map(([dork, descricao]) => ({
    descricao,
    url: `https://www.google.com/search?q=${encodeURIComponent(dork)}`,
  }))
}

// ─────────────────────────────────────────────────────────────────────────
// MÓDULO 7 — Domain Info
// ─────────────────────────────────────────────────────────────────────────

export interface DomainInfoResult {
  dominio: string
  ip: string | null
  proveedor: string | null
  tipoProveedor: 'gratuito' | 'cifrado' | 'descartavel' | 'corporativo'
  registrar: string | null
  criado: string | null
  expira: string | null
}

const FREE_PROVIDERS: Record<string, string> = {
  'gmail.com': 'Google Gmail',
  'googlemail.com': 'Google Gmail',
  'yahoo.com': 'Yahoo Mail',
  'yahoo.com.ar': 'Yahoo Mail AR',
  'outlook.com': 'Microsoft Outlook',
  'hotmail.com': 'Microsoft Hotmail',
  'live.com': 'Microsoft Live',
  'protonmail.com': 'ProtonMail (cifrado)',
  'proton.me': 'ProtonMail (cifrado)',
  'tutanota.com': 'Tutanota (cifrado)',
  'icloud.com': 'Apple iCloud',
  'me.com': 'Apple Me',
  'aol.com': 'AOL Mail',
  'yandex.com': 'Yandex Mail (Rússia)',
  'yandex.ru': 'Yandex Mail (Rússia)',
  'mail.ru': 'Mail.ru (Rússia)',
  'gmx.com': 'GMX Mail',
  'zoho.com': 'Zoho Mail',
  'temp-mail.org': 'Temporário/descartável',
  'guerrillamail.com': 'Temporário/descartável',
  'mailinator.com': 'Temporário/descartável',
  '10minutemail.com': 'Temporário/descartável',
  'sharklasers.com': 'Temporário/descartável',
}
const ENCRYPTED_PROVIDERS = new Set(['protonmail.com', 'proton.me', 'tutanota.com'])

interface RdapEvent { eventAction?: string; eventDate?: string }
interface RdapEntity { roles?: string[]; vcardArray?: unknown[] }

async function lookupRdapRegistrar(domain: string): Promise<{ registrar: string | null; criado: string | null; expira: string | null }> {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: 'application/rdap+json, application/json' },
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
      redirect: 'follow',
    })
    if (!res.ok) return { registrar: null, criado: null, expira: null }
    const data = (await res.json()) as Record<string, unknown>

    const events = (data.events as RdapEvent[] | undefined) ?? []
    const eventOf = (action: string) => events.find((e) => e.eventAction === action)?.eventDate ?? null

    const entities = (data.entities as RdapEntity[] | undefined) ?? []
    const registrarEntity = entities.find((e) => e.roles?.includes('registrar'))
    let registrar: string | null = null
    const vcard = registrarEntity?.vcardArray?.[1]
    if (Array.isArray(vcard)) {
      const fn = (vcard as unknown[][]).find((entry) => entry[0] === 'fn')
      if (fn && typeof fn[3] === 'string') registrar = fn[3]
    }

    return { registrar, criado: eventOf('registration'), expira: eventOf('expiration') }
  } catch {
    return { registrar: null, criado: null, expira: null }
  }
}

async function domainInfoLookup(email: string): Promise<DomainInfoResult> {
  const dominio = emailDomain(email)

  let ip: string | null = null
  try {
    const { address } = await dns.lookup(dominio)
    ip = address
  } catch {
    // domínio não resolvido — campo fica vazio
  }

  const proveedorLabel = FREE_PROVIDERS[dominio] ?? null
  if (proveedorLabel) {
    const tipoProveedor: DomainInfoResult['tipoProveedor'] = ENCRYPTED_PROVIDERS.has(dominio)
      ? 'cifrado'
      : proveedorLabel === 'Temporário/descartável'
        ? 'descartavel'
        : 'gratuito'
    return { dominio, ip, proveedor: proveedorLabel, tipoProveedor, registrar: null, criado: null, expira: null }
  }

  const rdap = await lookupRdapRegistrar(dominio)
  return { dominio, ip, proveedor: null, tipoProveedor: 'corporativo', ...rdap }
}

// ─────────────────────────────────────────────────────────────────────────
// Orquestração — corre todos os módulos em paralelo
// ─────────────────────────────────────────────────────────────────────────

export interface EmailHunterResult {
  email: string
  smtp: SmtpVerifyResult
  emailRep: EmailRepResult
  hudsonRock: HudsonRockResult
  breachCheck: BreachCheckResult
  gravatar: GravatarResult
  googleDorks: GoogleDork[]
  domainInfo: DomainInfoResult
  elapsedMs: number
}

export async function huntEmail(email: string): Promise<EmailHunterResult> {
  const start = Date.now()
  const [smtp, emailRep, hudsonRock, breachCheck, gravatar, domainInfo] = await Promise.all([
    smtpVerify(email),
    emailRepLookup(email),
    hudsonRockLookup(email),
    breachCheckLookup(email),
    gravatarLookup(email),
    domainInfoLookup(email),
  ])

  return {
    email,
    smtp,
    emailRep,
    hudsonRock,
    breachCheck,
    gravatar,
    googleDorks: googleDorks(email),
    domainInfo,
    elapsedMs: Date.now() - start,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Export — achatamento para o formato genérico de Relatórios (Secção/Campo/Valor)
// ─────────────────────────────────────────────────────────────────────────

const TIPO_PROVEEDOR_LABEL: Record<DomainInfoResult['tipoProveedor'], string> = {
  gratuito: 'Gratuito',
  cifrado: 'Cifrado',
  descartavel: 'Descartável',
  corporativo: 'Corporativo/privado',
}

/** Achata o resultado heterogéneo num conjunto de linhas Secção/Campo/Valor para export CSV/MD/PDF. */
export function toRelatorioRows(r: EmailHunterResult): RelatorioRow[] {
  const rows: RelatorioRow[] = []
  const add = (seccao: string, campo: string, valor: string | number | null) =>
    rows.push({ seccao, campo, valor })

  add('SMTP Verify', 'Domínio', r.smtp.dominio)
  add('SMTP Verify', 'Servidor MX', r.smtp.servidorMx)
  add('SMTP Verify', 'Estado', r.smtp.estado)
  add('SMTP Verify', 'Detalhe', r.smtp.detalhe)

  add('EmailRep.io', 'Disponível', boolLabel(r.emailRep.disponivel))
  if (r.emailRep.disponivel) {
    add('EmailRep.io', 'Reputação', r.emailRep.reputacao)
    add('EmailRep.io', 'Suspeito', boolLabel(r.emailRep.suspeito))
    add('EmailRep.io', 'Referências', r.emailRep.referencias)
    add('EmailRep.io', 'Blacklisted', boolLabel(r.emailRep.blacklisted))
    add('EmailRep.io', 'Atividade maliciosa', boolLabel(r.emailRep.atividadeMaliciosa))
    add('EmailRep.io', 'Credenciais expostas', boolLabel(r.emailRep.credenciaisExpostas))
    add('EmailRep.io', 'Em data breach', boolLabel(r.emailRep.dataBreach))
    add('EmailRep.io', 'Primeira vez visto', r.emailRep.primeiraVista)
    add('EmailRep.io', 'Última vez visto', r.emailRep.ultimaVista)
    add('EmailRep.io', 'SPF estrito', boolLabel(r.emailRep.spf))
    add('EmailRep.io', 'DMARC', boolLabel(r.emailRep.dmarc))
    add('EmailRep.io', 'Entregável', boolLabel(r.emailRep.deliverable))
    add('EmailRep.io', 'Provedor gratuito', boolLabel(r.emailRep.freeProvider))
    add('EmailRep.io', 'Descartável', boolLabel(r.emailRep.disposable))
    if (r.emailRep.perfis.length > 0) add('EmailRep.io', 'Perfis encontrados', r.emailRep.perfis.join(', '))
  } else if (r.emailRep.mensagem) {
    add('EmailRep.io', 'Mensagem', r.emailRep.mensagem)
  }

  add('HudsonRock (Infostealers)', 'Disponível', boolLabel(r.hudsonRock.disponivel))
  add('HudsonRock (Infostealers)', 'Registos encontrados', r.hudsonRock.encontrados)
  r.hudsonRock.registos.forEach((reg, i) => {
    const n = i + 1
    add('HudsonRock (Infostealers)', `Registo #${n} — Data`, reg.data)
    add('HudsonRock (Infostealers)', `Registo #${n} — Stealer`, reg.stealer)
    add('HudsonRock (Infostealers)', `Registo #${n} — OS`, reg.os)
    add('HudsonRock (Infostealers)', `Registo #${n} — Senha (parcial)`, reg.passwordParcial)
    add('HudsonRock (Infostealers)', `Registo #${n} — URL`, reg.url)
  })
  if (r.hudsonRock.mensagem) add('HudsonRock (Infostealers)', 'Mensagem', r.hudsonRock.mensagem)

  add('Breach Check', 'ProxyNova — Disponível', boolLabel(r.breachCheck.proxynova.disponivel))
  add('Breach Check', 'ProxyNova — Total de registos', r.breachCheck.proxynova.total)
  r.breachCheck.proxynova.amostra.forEach((linha, i) => add('Breach Check', `ProxyNova — Amostra #${i + 1}`, linha))
  if (r.breachCheck.proxynova.mensagem) add('Breach Check', 'ProxyNova — Mensagem', r.breachCheck.proxynova.mensagem)
  add('Breach Check', 'HIBP — Disponível', boolLabel(r.breachCheck.hibp.disponivel))
  r.breachCheck.hibp.breachesDominio.forEach((b, i) => {
    const n = i + 1
    add('Breach Check', `HIBP — Breach #${n} — Nome`, b.nome)
    add('Breach Check', `HIBP — Breach #${n} — Data`, b.data)
    add('Breach Check', `HIBP — Breach #${n} — Contas comprometidas`, b.contasComprometidas)
    add('Breach Check', `HIBP — Breach #${n} — Dados expostos`, b.dadosExpostos.join(', '))
  })
  if (r.breachCheck.hibp.mensagem) add('Breach Check', 'HIBP — Mensagem', r.breachCheck.hibp.mensagem)
  r.breachCheck.linksManuais.forEach((l) => add('Breach Check', `Link manual — ${l.nome}`, l.url))

  add('Gravatar', 'Encontrado', boolLabel(r.gravatar.encontrado))
  add('Gravatar', 'Avatar', r.gravatar.avatarUrl)
  if (r.gravatar.encontrado) {
    add('Gravatar', 'Nome', r.gravatar.displayName)
    add('Gravatar', 'Username', r.gravatar.username)
    add('Gravatar', 'Perfil', r.gravatar.perfilUrl)
    add('Gravatar', 'Bio', r.gravatar.bio)
    r.gravatar.redes.forEach((rede) => add('Gravatar', `Rede [${rede.rede}]`, rede.url))
  }

  r.googleDorks.forEach((d) => add('Google Dorks', d.descricao, d.url))

  add('Domínio', 'Domínio', r.domainInfo.dominio)
  add('Domínio', 'IP', r.domainInfo.ip)
  add('Domínio', 'Tipo', TIPO_PROVEEDOR_LABEL[r.domainInfo.tipoProveedor])
  if (r.domainInfo.proveedor) add('Domínio', 'Provedor', r.domainInfo.proveedor)
  if (r.domainInfo.registrar) add('Domínio', 'Registrar', r.domainInfo.registrar)
  if (r.domainInfo.criado) add('Domínio', 'Criado', r.domainInfo.criado)
  if (r.domainInfo.expira) add('Domínio', 'Expira', r.domainInfo.expira)

  return rows
}
