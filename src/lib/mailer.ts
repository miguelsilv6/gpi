import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { BRAND_DEFAULTS } from '@/lib/brand-defaults'
import { decryptSecret } from '@/lib/crypto-secrets'
import { childLogger } from '@/lib/logger'

const log = childLogger({ subsystem: 'mailer' })

type SmtpCfg = {
  smtpHost: string | null
  smtpPort: number | null
  smtpSecure: boolean
  smtpUser: string | null
  smtpPasswordEnc: string | null
}

let cachedTransport: nodemailer.Transporter | null = null
let cachedCfg: SmtpCfg | null = null

/**
 * Constrói o transporte SMTP. Precedência:
 *   1. ConfiguracaoSistema.smtpHost (definido pelo admin na UI) — usa toda a
 *      config da BD (host/port/secure/user + palavra-passe cifrada).
 *   2. Variáveis de ambiente SMTP_* (fallback / deploys sem config na UI).
 *
 * O transporte é cacheado e só recriado se a configuração na BD mudar.
 */
async function createTransport() {
  try {
    const cfg = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpPasswordEnc: true,
      },
    })

    const smtpHost = cfg?.smtpHost ?? null
    const smtpPort = cfg?.smtpPort ?? null
    const smtpSecure = cfg?.smtpSecure ?? false
    const smtpUser = cfg?.smtpUser ?? null
    const smtpPasswordEnc = cfg?.smtpPasswordEnc ?? null

    if (
      cachedTransport &&
      cachedCfg &&
      cachedCfg.smtpHost === smtpHost &&
      cachedCfg.smtpPort === smtpPort &&
      cachedCfg.smtpSecure === smtpSecure &&
      cachedCfg.smtpUser === smtpUser &&
      cachedCfg.smtpPasswordEnc === smtpPasswordEnc
    ) {
      return cachedTransport
    }

    cachedCfg = cfg ?? null

    if (cfg?.smtpHost) {
      let pass: string | undefined
      if (cfg.smtpPasswordEnc) {
        try {
          pass = decryptSecret(cfg.smtpPasswordEnc)
        } catch (err) {
          log.error({ err }, 'Falha a decifrar smtpPasswordEnc — a ignorar autenticação')
        }
      }
      cachedTransport = nodemailer.createTransport({
        host: cfg.smtpHost,
        port: cfg.smtpPort ?? 587,
        secure: cfg.smtpSecure,
        auth: cfg.smtpUser && pass ? { user: cfg.smtpUser, pass } : undefined,
      })
      return cachedTransport
    }
  } catch (err) {
    log.warn({ err }, 'Falha a ler config SMTP da BD — a usar variáveis de ambiente')
  }

  if (cachedTransport && cachedCfg && !cachedCfg.smtpHost) {
    return cachedTransport
  }

  cachedCfg = { smtpHost: null, smtpPort: null, smtpSecure: false, smtpUser: null, smtpPasswordEnc: null }
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: parseInt(process.env.SMTP_PORT ?? '1025'),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  })
  return cachedTransport
}

/**
 * Indica se o email está configurado — via BD (smtpHost) ou env (SMTP_HOST).
 * Útil para a UI mostrar avisos quando o envio não está pronto.
 */
export async function isEmailConfigured(): Promise<boolean> {
  if (process.env.SMTP_HOST) return true
  try {
    const cfg = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { smtpHost: true },
    })
    return !!cfg?.smtpHost
  } catch {
    return false
  }
}

/**
 * Resolve o cabeçalho From com a marca actual. Precedência:
 *   1. SMTP_FROM env var (override absoluto, ex: para staging)
 *   2. `<emailRemetenteNome> <emailRemetenteAddr>` da ConfiguracaoSistema
 *   3. Defaults (BRAND_DEFAULTS.appName / noreply@gpi.pt)
 */
async function resolveFromHeader(): Promise<string> {
  if (process.env.SMTP_FROM) return process.env.SMTP_FROM
  try {
    const cfg = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { emailRemetenteNome: true, emailRemetenteAddr: true, appName: true },
    })
    const name = cfg?.emailRemetenteNome ?? cfg?.appName ?? BRAND_DEFAULTS.appName
    const addr = cfg?.emailRemetenteAddr ?? 'noreply@gpi.pt'
    return `${name} <${addr}>`
  } catch {
    return `${BRAND_DEFAULTS.appName} <noreply@gpi.pt>`
  }
}

export async function sendMail(opts: {
  to: string
  subject: string
  text: string
  html?: string
}) {
  if (process.env.DISABLE_EMAIL === 'true') return

  const emailCfg = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { emailNotificacoesAtivo: true },
  })
  if (emailCfg && !emailCfg.emailNotificacoesAtivo) return

  const transport = await createTransport()
  await transport.sendMail({
    from: await resolveFromHeader(),
    ...opts,
  })
}
