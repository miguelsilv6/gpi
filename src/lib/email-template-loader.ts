import { prisma } from '@/lib/prisma'
import { BRAND_DEFAULTS } from '@/lib/brand-defaults'
import { normalizeEmailTemplate, type EmailTemplate } from '@/lib/email-template'

/**
 * Carregamento (com cache TTL 60s) do template de e-mail + nome da aplicação,
 * para o `applyPolicy` não bater na BD a cada envio. Invalidado pelo endpoint
 * PUT após gravar. Em multi-processo, cada processo tem o seu cache — até 60s
 * de latência para ver mudanças (aceitável, como no cache de policies).
 */

interface Cached {
  ctx: { tpl: EmailTemplate; appName: string }
  expiresAt: number
}

let cache: Cached | null = null
const TTL_MS = 60_000

export async function getEmailTemplateContext(): Promise<{ tpl: EmailTemplate; appName: string }> {
  if (cache && cache.expiresAt > Date.now()) return cache.ctx

  let tpl = normalizeEmailTemplate(null)
  let appName: string = BRAND_DEFAULTS.appName
  try {
    const cfg = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { emailTemplate: true, appName: true },
    })
    tpl = normalizeEmailTemplate(cfg?.emailTemplate ?? null)
    appName = cfg?.appName ?? BRAND_DEFAULTS.appName
  } catch {
    // Falha de leitura → defaults (fail-safe: o e-mail sai na mesma).
  }

  const ctx = { tpl, appName }
  cache = { ctx, expiresAt: Date.now() + TTL_MS }
  return ctx
}

export function invalidateEmailTemplateCache(): void {
  cache = null
}
