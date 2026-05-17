import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit, diff } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  prazoAlertaDias: z.number().int().min(1).max(365).optional(),
  backupScheduleCron: z.string().min(1).max(100).optional(),
  emailRemetenteNome: z.string().min(1).max(100).optional(),
  emailRemetenteAddr: z.string().email().optional(),
})

export async function GET() {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) return apiError('Sem permissão', 403)

    const config = await prisma.configuracaoSistema.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
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
    if (!hasPermission(role, 'sistema:config')) return apiError('Sem permissão', 403)

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const before = await prisma.configuracaoSistema.findUnique({ where: { id: 'singleton' } })

    const config = await prisma.configuracaoSistema.upsert({
      where: { id: 'singleton' },
      update: parsed.data,
      create: { id: 'singleton', ...parsed.data },
    })

    const changes = before
      ? diff(before, config, [
          'prazoAlertaDias',
          'backupScheduleCron',
          'emailRemetenteNome',
          'emailRemetenteAddr',
        ])
      : null
    if (changes || !before) {
      await writeAudit({
        req,
        acao: before ? 'UPDATE_CONFIG_SISTEMA' : 'CREATE_CONFIG_SISTEMA',
        entidade: 'ConfiguracaoSistema',
        entidadeId: 'singleton',
        utilizadorId: session.user.id,
        detalhes: (changes ?? parsed.data) as never,
      })
    }

    return Response.json(config)
  } catch (error) {
    return handleApiError(error)
  }
}
