/**
 * Manifest dinâmico (PWA). Substitui o antigo `public/manifest.json`
 * estático que apontava para `/icon-192.png` e `/icon-512.png` (ficheiros
 * que não existiam — link partido pré-existente).
 *
 * Os ícones do manifest apontam para o logo light enviado pelo admin
 * (via `/branding/...?v=<ts>`) ou para os defaults shipped em
 * `public/branding-defaults/icon-{192,512}.png`.
 */
import type { MetadataRoute } from 'next'
import { getBrand, brandAssetUrl } from '@/lib/brand'

export const dynamic = 'force-dynamic'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await getBrand()
  const lightLogo = brandAssetUrl(b.logoLightFilename, b.brandUpdatedAt)

  return {
    name: `${b.appName} — ${b.appDescription}`,
    short_name: b.appShortName,
    description: b.manifestDescription,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    orientation: 'portrait-primary',
    lang: 'pt-PT',
    icons: [
      // Por defeito servimos um SVG escalável; quando o admin envia PNG
      // via /api/branding/logo, lightLogo passa a apontar para esse asset
      // e o type continua correto via Content-Type da response.
      {
        src: lightLogo ?? '/branding-defaults/logo-light.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: lightLogo ?? '/branding-defaults/logo-light.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
