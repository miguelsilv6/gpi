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

  try {
    const cfg = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { emailTemplate: true, appName: true },
    })
    const ctx = {
      tpl: normalizeEmailTemplate(cfg?.emailTemplate ?? null),
      appName: cfg?.appName ?? BRAND_DEFAULTS.appName,
    }
    // Só cacheamos em caso de sucesso — assim uma falha transitória da BD não
    // fixa os defaults durante 60s (a próxima chamada volta a tentar).
    cache = { ctx, expiresAt: Date.now() + TTL_MS }
    return ctx
  } catch {
    // Falha de leitura → defaults, SEM cachear o estado de erro (fail-safe:
    // o e-mail sai na mesma; a próxima tentativa relê da BD assim que recuperar).
    return { tpl: normalizeEmailTemplate(null), appName: BRAND_DEFAULTS.appName }
  }
}

export function invalidateEmailTemplateCache(): void {
  cache = null
}
