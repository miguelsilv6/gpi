import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { buildEstatisticaMensal } from '@/lib/estatistica-mensal'
import type { Role } from '@/generated/prisma/enums'

const querySchema = z.object({
  ano: z.coerce.number().int().min(1900).max(3000),
  mes: z.coerce.number().int().min(1).max(12),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!hasPermission(role, 'estatistica:read')) {
      return apiError('Sem permissão para ver estatísticas', 403)
    }

    const { searchParams } = new URL(req.url)
    const now = new Date()
    const parsed = querySchema.safeParse({
      ano: searchParams.get('ano') ?? now.getFullYear(),
      mes: searchParams.get('mes') ?? now.getMonth() + 1,
    })
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = await buildEstatisticaMensal({
      ano: parsed.data.ano,
      mes: parsed.data.mes,
      role,
      sessionBrigadaId: session.user.brigadaId,
    })
    if (!data) return apiError('Sessão sem brigada associada — refresh ou re-login', 403)

    return Response.json(data)
  } catch (error) {
    return handleApiError(error)
  }
}
