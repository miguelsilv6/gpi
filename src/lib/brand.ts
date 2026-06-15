/**
 * Carregador da personalização (branding) — lê `ConfiguracaoSistema` e
 * funde com `BRAND_DEFAULTS`. Cached por request via React `cache()` para
 * deduplicar leituras quando vários Server Components (layout, metadata,
 * sidebar) chamam no mesmo render.
 *
 * Importável apenas de Server Components / route handlers / metadata —
 * tem `import 'server-only'`. Para client components, ver `useBrand()`
 * em `src/components/brand-provider.tsx`.
 */
import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { BRAND_DEFAULTS, type Brand } from './brand-defaults'

export { BRAND_DEFAULTS, type Brand }

export const getBrand = cache(async (): Promise<Brand> => {
  let row: {
    appName: string | null
    appShortName: string | null
    appDescription: string | null
    manifestDescription: string | null
    pdfFooterText: string | null
    appAuthor: string | null
    logoLightFilename: string | null
    logoDarkFilename: string | null
    faviconFilename: string | null
    logoHorizontalLightFilename: string | null
    logoHorizontalDarkFilename: string | null
    logoHorizontalEscala: number
    logoHorizontalAlinhamento: string
    brandUpdatedAt: Date | null
  } | null
  try {
    row = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: {
        appName: true,
        appShortName: true,
        appDescription: true,
        manifestDescription: true,
        pdfFooterText: true,
        appAuthor: true,
        logoLightFilename: true,
        logoDarkFilename: true,
        faviconFilename: true,
        logoHorizontalLightFilename: true,
        logoHorizontalDarkFilename: true,
        logoHorizontalEscala: true,
        logoHorizontalAlinhamento: true,
        brandUpdatedAt: true,
      },
    })
  } catch {
    // Em primeiro boot a tabela pode ainda não existir, ou a BD pode estar
    // temporariamente inacessível. Servir defaults é sempre seguro — o pior
    // que acontece é o utilizador ver a marca pré-configurada.
    return { ...BRAND_DEFAULTS }
  }
  if (!row) return { ...BRAND_DEFAULTS }
  return {
    appName: row.appName ?? BRAND_DEFAULTS.appName,
    appShortName: row.appShortName ?? BRAND_DEFAULTS.appShortName,
    appDescription: row.appDescription ?? BRAND_DEFAULTS.appDescription,
    manifestDescription: row.manifestDescription ?? BRAND_DEFAULTS.manifestDescription,
    pdfFooterText: row.pdfFooterText ?? BRAND_DEFAULTS.pdfFooterText,
    appAuthor: row.appAuthor ?? BRAND_DEFAULTS.appAuthor,
    logoLightFilename: row.logoLightFilename,
    logoDarkFilename: row.logoDarkFilename,
    faviconFilename: row.faviconFilename,
    logoHorizontalLightFilename: row.logoHorizontalLightFilename,
    logoHorizontalDarkFilename: row.logoHorizontalDarkFilename,
    logoHorizontalEscala: row.logoHorizontalEscala,
    logoHorizontalAlinhamento: row.logoHorizontalAlinhamento,
    brandUpdatedAt: row.brandUpdatedAt,
  }
})

/**
 * Constrói a URL pública para um asset de branding com query string de
 * cache-busting. Devolve null se o ficheiro não estiver definido (caller
 * deve cair para o asset default em `public/branding-defaults/`).
 */
export function brandAssetUrl(filename: string | null, brandUpdatedAt: Date | null): string | null {
  if (!filename) return null
  const v = brandUpdatedAt ? brandUpdatedAt.getTime() : 0
  return `/branding/${encodeURIComponent(filename)}?v=${v}`
}
