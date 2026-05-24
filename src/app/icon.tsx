/**
 * Favicon dinâmico. Substitui o antigo `src/app/favicon.ico` estático.
 *
 * Next.js trata este ficheiro como rota especial servida em `/icon`. Lê o
 * `faviconFilename` do brand actual em BRANDING_DIR; se ausente ou
 * inacessível, faz fallback para `public/branding-defaults/favicon.ico`
 * (shipped com a app).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getBrand } from '@/lib/brand'
import { resolveBrandingPath, mimeFromExtension } from '@/lib/branding'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const size = { width: 32, height: 32 }
export const contentType = 'image/x-icon'

export default async function Icon() {
  const brand = await getBrand()
  if (brand.faviconFilename) {
    const p = resolveBrandingPath(brand.faviconFilename)
    if (p) {
      try {
        const buf = await fs.readFile(p)
        const ext = path.extname(brand.faviconFilename).slice(1)
        return new Response(buf as unknown as BodyInit, {
          headers: { 'Content-Type': mimeFromExtension(ext) },
        })
      } catch {
        // fall-through para o default
      }
    }
  }
  const fallback = await fs.readFile(
    path.join(process.cwd(), 'public', 'branding-defaults', 'favicon.ico'),
  )
  return new Response(fallback as unknown as BodyInit, {
    headers: { 'Content-Type': 'image/x-icon' },
  })
}
