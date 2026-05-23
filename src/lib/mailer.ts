import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { BRAND_DEFAULTS } from '@/lib/brand-defaults'

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: parseInt(process.env.SMTP_PORT ?? '1025'),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  })
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

  const transport = createTransport()
  await transport.sendMail({
    from: await resolveFromHeader(),
    ...opts,
  })
}
