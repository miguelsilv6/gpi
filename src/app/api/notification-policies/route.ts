import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { invalidatePolicyCache } from '@/lib/notifications'
import {
  NOTIFICATION_TIPO_LABELS,
  NOTIFICATION_TIPO_DESCRIPTIONS,
  NOTIFICATION_TIPO_HAS_NATURAL,
} from '@/lib/notification-labels'
import { TipoNotificacao, Role } from '@/generated/prisma/enums'
import type { Role as RoleType } from '@/generated/prisma/enums'

/**
 * GET — devolve todas as policies enriquecidas com labels/descrições para
 * o UI não ter de fazer round-trip extra. PUT — actualiza um array de
 * policies numa única transação Prisma e invalida o cache em memória.
 *
 * Ambos os endpoints exigem `sistema:config` (só ADMINISTRACAO).
 */

const tipoValues = Object.values(TipoNotificacao) as [string, ...string[]]
const roleValues = Object.values(Role) as [string, ...string[]]

const policyUpdateSchema = z.object({
  tipo: z.enum(tipoValues),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  ccRoles: z.array(z.enum(roleValues)),
})

const putBodySchema = z.object({
  policies: z.array(policyUpdateSchema).min(1).max(20),
})

export async function GET() {
  try {
    const session = await getSession()
    if (!hasPermission(session.user.role as RoleType, 'sistema:config')) {
      return apiError('Sem permissão', 403)
    }

    const rows = await prisma.notificationPolicy.findMany({
      orderBy: { tipo: 'asc' },
    })

    // Enriquecer com labels — o UI usa directamente, sem rebuscar.
    const enriched = rows.map((r) => ({
      tipo: r.tipo,
      label: NOTIFICATION_TIPO_LABELS[r.tipo] ?? r.tipo,
      descricao: NOTIFICATION_TIPO_DESCRIPTIONS[r.tipo] ?? '',
      hasNaturalRecipient: NOTIFICATION_TIPO_HAS_NATURAL[r.tipo] ?? false,
      inAppEnabled: r.inAppEnabled,
      emailEnabled: r.emailEnabled,
      ccRoles: r.ccRoles,
      updatedAt: r.updatedAt,
    }))

    return Response.json({ policies: enriched })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession()
    if (!hasPermission(session.user.role as RoleType, 'sistema:config')) {
      return apiError('Sem permissão', 403)
    }

    const body = await req.json().catch(() => null)
    const parsed = putBodySchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Pedido inválido', 400)
    }

    // Carregar estado anterior para incluir no audit diff.
    const before = await prisma.notificationPolicy.findMany({
      orderBy: { tipo: 'asc' },
    })
    const beforeByTipo = new Map(before.map((p) => [p.tipo, p]))

    // Aplicar todas as alterações numa transação — ou tudo, ou nada.
    await prisma.$transaction(
      parsed.data.policies.map((p) =>
        prisma.notificationPolicy.upsert({
          where: { tipo: p.tipo as TipoNotificacao },
          create: {
            tipo: p.tipo as TipoNotificacao,
            inAppEnabled: p.inAppEnabled,
            emailEnabled: p.emailEnabled,
            ccRoles: p.ccRoles as RoleType[],
          },
          update: {
            inAppEnabled: p.inAppEnabled,
            emailEnabled: p.emailEnabled,
            ccRoles: p.ccRoles as RoleType[],
          },
        }),
      ),
    )

    // Invalidar cache em memória — próximas chamadas a applyPolicy releem da BD.
    invalidatePolicyCache()

    // Audit: regista só as policies que mudaram (diff por tipo).
    const changes: Record<string, { before: object | null; after: object }> = {}
    for (const p of parsed.data.policies) {
      const prev = beforeByTipo.get(p.tipo as TipoNotificacao)
      const next = {
        inAppEnabled: p.inAppEnabled,
        emailEnabled: p.emailEnabled,
        ccRoles: p.ccRoles,
      }
      if (
        !prev ||
        prev.inAppEnabled !== next.inAppEnabled ||
        prev.emailEnabled !== next.emailEnabled ||
        JSON.stringify(prev.ccRoles) !== JSON.stringify(next.ccRoles)
      ) {
        changes[p.tipo] = {
          before: prev
            ? {
                inAppEnabled: prev.inAppEnabled,
                emailEnabled: prev.emailEnabled,
                ccRoles: prev.ccRoles,
              }
            : null,
          after: next,
        }
      }
    }

    if (Object.keys(changes).length > 0) {
      await writeAudit({
        req,
        acao: 'UPDATE_NOTIFICATION_POLICIES',
        entidade: 'NotificationPolicy',
        entidadeId: '__bulk__',
        utilizadorId: session.user.id,
        detalhes: { changes },
      })
    }

    return Response.json({ ok: true, changed: Object.keys(changes).length })
  } catch (error) {
    return handleApiError(error)
  }
}
