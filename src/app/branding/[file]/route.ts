import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { resolveBrandingPath, mimeFromExtension } from '@/lib/branding'

export const runtime = 'nodejs'

/**
 * Serve um asset de branding do BRANDING_DIR. Público (no auth) — a
 * página de login precisa de ler o logo antes de qualquer sessão.
 *
 * Cache: 5 min com revalidation. O cliente faz cache-bust adicionando
 * `?v=<brandUpdatedAt>` à URL — sempre que o admin altera o brand, o
 * número muda e o browser refetch.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params
  const fullPath = resolveBrandingPath(file)
  if (!fullPath) return new Response('Not found', { status: 404 })

  try {
    const buf = await fs.readFile(fullPath)
    const ext = path.extname(file).slice(1)
    return new Response(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': mimeFromExtension(ext),
        'Cache-Control': 'public, max-age=300, must-revalidate',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
