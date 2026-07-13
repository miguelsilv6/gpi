import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import {
  normalizeEmailTemplate,
  EMAIL_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_LIMITS,
} from '@/lib/email-template'
import { invalidateEmailTemplateCache } from '@/lib/email-template-loader'
import type { Prisma } from '@/generated/prisma/client'
import type { Role as RoleType } from '@/generated/prisma/enums'

/**
 * Template (global) dos e-mails de notificação. GET/PUT exigem `sistema:config`
 * (só ADMINISTRACAO). O valor vive em `ConfiguracaoSistema.emailTemplate` (Json);
 * null = defaults. O PUT invalida o cache em memória usado pelo `applyPolicy`.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const emailTemplateSchema = z.object({
  mostrarCabecalho: z.boolean(),
  corDestaque: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida — use o formato #rrggbb'),
  saudacao: z.string().max(EMAIL_TEMPLATE_LIMITS.saudacao),
  rodape: z.string().max(EMAIL_TEMPLATE_LIMITS.rodape),
  avisoLegal: z.string().max(EMAIL_TEMPLATE_LIMITS.avisoLegal),
  assuntoPrefixo: z.string().max(EMAIL_TEMPLATE_LIMITS.assuntoPrefixo),
})

export async function GET() {
  try {
    const session = await getSession()
    if (!hasPermission(session.user.role as RoleType, 'sistema:config')) {
      return apiError('Sem permissão', 403)
    }

    const cfg = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { emailTemplate: true },
    })

    return Response.json({
      template: normalizeEmailTemplate(cfg?.emailTemplate ?? null),
      defaults: EMAIL_TEMPLATE_DEFAULTS,
    })
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

    const parsed = emailTemplateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Pedido inválido', 400)
    }

    const before = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { emailTemplate: true },
    })

    await prisma.configuracaoSistema.upsert({
      where: { id: 'singleton' },
      update: { emailTemplate: parsed.data as Prisma.InputJsonValue },
      create: { id: 'singleton', emailTemplate: parsed.data as Prisma.InputJsonValue },
    })

    invalidateEmailTemplateCache()

    await writeAudit({
      req,
      acao: 'UPDATE_EMAIL_TEMPLATE',
      entidade: 'ConfiguracaoSistema',
      entidadeId: 'singleton',
      utilizadorId: session.user.id,
      detalhes: {
        before: normalizeEmailTemplate(before?.emailTemplate ?? null),
        after: parsed.data,
      },
    })

    return Response.json({ ok: true, template: parsed.data })
  } catch (error) {
    return handleApiError(error)
  }
}
