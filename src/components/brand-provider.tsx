'use client'

/**
 * Contexto cliente para a identidade da app. Hidratado uma vez no Server
 * Component do RootLayout (e dos sub-layouts `(auth)` / `(dashboard)`)
 * com o resultado de `getBrand()`. Componentes cliente (sidebar, login,
 * password reset, etc.) lêem via `useBrand()`.
 *
 * Importa apenas de `@/lib/brand-defaults` (sem `server-only`) — o módulo
 * `@/lib/brand` está fora dos limites para componentes cliente.
 */
import { createContext, useContext } from 'react'
import { BRAND_DEFAULTS, type Brand } from '@/lib/brand-defaults'

const BrandContext = createContext<Brand>(BRAND_DEFAULTS as unknown as Brand)

export function BrandProvider({
  value,
  children,
}: {
  value: Brand
  children: React.ReactNode
}) {
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}

export function useBrand(): Brand {
  return useContext(BrandContext)
}

/**
 * Devolve a URL pública para um asset com query string de cache-busting
 * (`?v=<brandUpdatedAt>`). Null = caller deve usar o default.
 */
export function useBrandAssetUrl(variant: 'light' | 'dark' | 'favicon' | 'horizontal-light' | 'horizontal-dark'): string | null {
  const b = useBrand()
  const name =
    variant === 'light' ? b.logoLightFilename
      : variant === 'dark' ? b.logoDarkFilename
        : variant === 'horizontal-light' ? b.logoHorizontalLightFilename
          : variant === 'horizontal-dark' ? b.logoHorizontalDarkFilename
            : b.faviconFilename
  if (!name) return null
  const v = b.brandUpdatedAt ? new Date(b.brandUpdatedAt).getTime() : 0
  return `/branding/${encodeURIComponent(name)}?v=${v}`
}
