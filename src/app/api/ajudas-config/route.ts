import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  vencimentoBase: z.number().positive(),
  vencimentoDN: z.number().positive(),
  percentPiqueteSemana: z.number().min(0).max(1),
  percentPiqueteFds: z.number().min(0).max(1),
  percentPrevencaoPassiva: z.number().min(0).max(1),
  senhaAlmoco: z.number().min(0),
  senhaJantar: z.number().min(0),
  senhaCeia: z.number().min(0),
  taxaIRS: z.number().min(0).max(1),
  taxaSS: z.number().min(0).max(1),
  distanciaMinKmAjudas: z.number().int().min(0),
})

export async function GET() {
  try {
    await getSession()
    const config = await prisma.ajudasConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    })
    return Response.json(config)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'ajudas:config')) return apiError('Sem permissão', 403)

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)

    const config = await prisma.ajudasConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...parsed.data },
      update: parsed.data,
    })

    await writeAudit({
      req,
      acao: 'UPDATE_AJUDAS_CONFIG',
      entidade: 'AjudasConfig',
      entidadeId: 'default',
      utilizadorId: session.user.id,
      detalhes: parsed.data as never,
    })

    return Response.json(config)
  } catch (error) {
    return handleApiError(error)
  }
}
