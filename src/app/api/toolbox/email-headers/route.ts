import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { analyzeEmailHeaders } from '@/lib/toolbox/email-headers'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  headers: z.string().min(10, 'Cole o cabeçalho completo do email').max(200_000),
})

/**
 * Análise de cabeçalhos de email: cadeia Received, IP de origem,
 * SPF/DKIM/DMARC e sinais de spoofing. Parsing local — nada sai do servidor.
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

    return Response.json(analyzeEmailHeaders(parsed.data.headers))
  } catch (error) {
    return handleApiError(error)
  }
}
