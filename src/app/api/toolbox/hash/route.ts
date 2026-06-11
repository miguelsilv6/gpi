import { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  texto: z.string().min(1).max(1_000_000),
})

/**
 * Calcula hashes (MD5/SHA-1/SHA-256/SHA-512) de um texto — útil para
 * comparar com IOCs publicados ou verificar integridade de evidências.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloToolboxAtivo(role))) {
      return apiError('O módulo Toolbox está desativado', 503)
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const buf = Buffer.from(parsed.data.texto, 'utf8')
    return Response.json({
      md5: createHash('md5').update(buf).digest('hex'),
      sha1: createHash('sha1').update(buf).digest('hex'),
      sha256: createHash('sha256').update(buf).digest('hex'),
      sha512: createHash('sha512').update(buf).digest('hex'),
      bytes: buf.length,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
