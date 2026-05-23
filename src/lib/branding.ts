/**
 * Helpers partilhados pelas rotas de /api/branding/*.
 * Centraliza o caminho de armazenamento e a validação de filenames para
 * evitar bugs de path traversal.
 *
 * Espelha `src/lib/backups.ts` — ler aquele primeiro para entender o
 * padrão "triple-belt" (basename + regex + path.resolve).
 */
import path from 'node:path'

export const BRANDING_DIR = process.env.BRANDING_DIR ?? '/app/branding'

export const MAX_UPLOAD_BYTES = 1 * 1024 * 1024 // 1 MB

export const ALLOWED_MIME_LOGO = [
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
] as const

export const ALLOWED_MIME_FAVICON = [
  ...ALLOWED_MIME_LOGO,
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const

export type LogoVariant = 'light' | 'dark'

/**
 * Regex estrita: prefixo conhecido + extensão. Bloqueia tudo o resto
 * para que um pedido com filename arbitrário não consiga escapar do
 * BRANDING_DIR nem servir ficheiros inesperados.
 */
const FILENAME_REGEX = /^(logo-light|logo-dark|favicon)\.(png|jpg|jpeg|svg|webp|ico)$/

export function resolveBrandingPath(filename: string): string | null {
  if (typeof filename !== 'string' || filename.length === 0) return null
  if (path.basename(filename) !== filename) return null
  if (!FILENAME_REGEX.test(filename)) return null
  const resolved = path.resolve(BRANDING_DIR, filename)
  if (!resolved.startsWith(path.resolve(BRANDING_DIR) + path.sep)) return null
  return resolved
}

export function extensionFromMime(mime: string): string | null {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/svg+xml':
      return 'svg'
    case 'image/webp':
      return 'webp'
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon':
      return 'ico'
  }
  return null
}

export function mimeFromExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'svg':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    case 'ico':
      return 'image/x-icon'
  }
  return 'application/octet-stream'
}

/**
 * Constrói o filename canónico para um asset, dado o tipo e a extensão.
 * Único ponto que conhece a convenção `logo-light.{ext}` etc.
 */
export function brandingFilename(
  kind: 'logo-light' | 'logo-dark' | 'favicon',
  ext: string,
): string {
  return `${kind}.${ext}`
}

/**
 * Lista das extensões alternativas para o mesmo "slot" — usada pelo
 * upload para apagar ficheiros antigos quando o admin troca o formato
 * (e.g. carrega PNG depois de ter SVG).
 */
export const ALL_EXTENSIONS = ['png', 'jpg', 'jpeg', 'svg', 'webp', 'ico'] as const
