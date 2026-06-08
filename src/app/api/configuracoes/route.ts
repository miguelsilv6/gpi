import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit, diff } from '@/lib/audit'
import { encryptSecret } from '@/lib/crypto-secrets'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  prazoAlertaDias: z.number().int().min(1).max(365).optional(),
  prazoAlertaDiasUrgente: z.number().int().min(1).max(365).nullable().optional(),
  backupScheduleCron: z.string().min(1).max(100).optional(),
  emailRemetenteNome: z.string().min(1).max(100).optional(),
  emailRemetenteAddr: z.string().email().optional(),
  inqueritoFiltroEstadosDefault: z.array(z.string().min(1).max(40)).max(20).optional(),
  maintenanceMode: z.boolean().optional(),
  moduloAjudasAtivo: z.boolean().optional(),
  moduloAjudasRoles: z.string().optional(),
  moduloFeriasAtivo: z.boolean().optional(),
  moduloFeriasRoles: z.string().optional(),
  moduloBugReportsAtivo: z.boolean().optional(),
  moduloBugReportsRoles: z.string().optional(),
  sessaoTimeoutMinutos: z.number().int().min(0).max(1440).optional(),
  // SMTP — host/user vazios = limpar (volta ao fallback de env vars).
  smtpHost: z.string().max(255).optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().max(255).optional(),
  // Texto simples na entrada; cifrado antes de gravar. Vazio = remover a pass.
  smtpPassword: z.string().max(255).optional(),
})

/** Remove o ciphertext da pass do objeto devolvido e expõe só se está definida. */
function publicConfig<T extends { smtpPasswordEnc?: string | null }>(config: T) {
  const { smtpPasswordEnc, ...rest } = config
  return { ...rest, smtpPasswordSet: !!smtpPasswordEnc }
}

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

    return Response.json(publicConfig(config))
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

    // Validate urgent threshold < normal threshold. When only one is in the
    // payload, fall back to the current DB value for the other.
    if (parsed.data.prazoAlertaDiasUrgente != null) {
      const currentNormal = parsed.data.prazoAlertaDias
        ?? (await prisma.configuracaoSistema.findUnique({ where: { id: 'singleton' }, select: { prazoAlertaDias: true } }))?.prazoAlertaDias
        ?? 7
      if (parsed.data.prazoAlertaDiasUrgente >= currentNormal) {
        return apiError(
          'prazoAlertaDiasUrgente deve ser inferior a prazoAlertaDias',
          400,
        )
      }
    }

    // A palavra-passe SMTP não é uma coluna directa — cifra-se para smtpPasswordEnc.
    // Vazio = remover; ausente = manter inalterada.
    const { smtpPassword, smtpHost, smtpUser, ...rest } = parsed.data
    const data: Record<string, unknown> = { ...rest }
    // Normalizar strings vazias para null (volta ao fallback de env).
    if (smtpHost !== undefined) data.smtpHost = smtpHost.trim() || null
    if (smtpUser !== undefined) data.smtpUser = smtpUser.trim() || null
    if (smtpPassword !== undefined) {
      data.smtpPasswordEnc = smtpPassword === '' ? null : encryptSecret(smtpPassword)
    }

    const before = await prisma.configuracaoSistema.findUnique({ where: { id: 'singleton' } })

    const config = await prisma.configuracaoSistema.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    })

    // Narrow to scalar fields before calling diff (helper doesn't handle arrays)
    const scalarChanges = before
      ? diff(
          {
            prazoAlertaDias: before.prazoAlertaDias,
            prazoAlertaDiasUrgente: before.prazoAlertaDiasUrgente,
            backupScheduleCron: before.backupScheduleCron,
            emailRemetenteNome: before.emailRemetenteNome,
            emailRemetenteAddr: before.emailRemetenteAddr,
            maintenanceMode: before.maintenanceMode,
            moduloAjudasAtivo: before.moduloAjudasAtivo,
            moduloAjudasRoles: before.moduloAjudasRoles,
            moduloFeriasAtivo: before.moduloFeriasAtivo,
            moduloFeriasRoles: before.moduloFeriasRoles,
            moduloBugReportsAtivo: before.moduloBugReportsAtivo,
            moduloBugReportsRoles: before.moduloBugReportsRoles,
            sessaoTimeoutMinutos: before.sessaoTimeoutMinutos,
            smtpHost: before.smtpHost,
            smtpPort: before.smtpPort,
            smtpSecure: before.smtpSecure,
            smtpUser: before.smtpUser,
          },
          {
            prazoAlertaDias: config.prazoAlertaDias,
            prazoAlertaDiasUrgente: config.prazoAlertaDiasUrgente,
            backupScheduleCron: config.backupScheduleCron,
            emailRemetenteNome: config.emailRemetenteNome,
            emailRemetenteAddr: config.emailRemetenteAddr,
            maintenanceMode: config.maintenanceMode,
            moduloAjudasAtivo: config.moduloAjudasAtivo,
            moduloAjudasRoles: config.moduloAjudasRoles,
            moduloFeriasAtivo: config.moduloFeriasAtivo,
            moduloFeriasRoles: config.moduloFeriasRoles,
            moduloBugReportsAtivo: config.moduloBugReportsAtivo,
            moduloBugReportsRoles: config.moduloBugReportsRoles,
            sessaoTimeoutMinutos: config.sessaoTimeoutMinutos,
            smtpHost: config.smtpHost,
            smtpPort: config.smtpPort,
            smtpSecure: config.smtpSecure,
            smtpUser: config.smtpUser,
          },
          [
            'prazoAlertaDias',
            'prazoAlertaDiasUrgente',
            'backupScheduleCron',
            'emailRemetenteNome',
            'emailRemetenteAddr',
            'maintenanceMode',
            'moduloAjudasAtivo',
            'moduloAjudasRoles',
            'moduloFeriasAtivo',
            'moduloFeriasRoles',
            'moduloBugReportsAtivo',
            'moduloBugReportsRoles',
            'sessaoTimeoutMinutos',
            'smtpHost',
            'smtpPort',
            'smtpSecure',
            'smtpUser',
          ],
        )
      : null

    // A palavra-passe nunca é registada na auditoria — só se mudou.
    const passwordChanged =
      smtpPassword !== undefined && (before?.smtpPasswordEnc ?? null) !== (config.smtpPasswordEnc ?? null)

    // The diff helper doesn't compare arrays; do it manually so audit captures
    // changes to inqueritoFiltroEstadosDefault as well.
    const arrayChanged = before
      ? JSON.stringify(before.inqueritoFiltroEstadosDefault ?? []) !==
        JSON.stringify(config.inqueritoFiltroEstadosDefault ?? [])
      : true

    if (scalarChanges || arrayChanged || passwordChanged || !before) {
      await writeAudit({
        req,
        acao: before ? 'UPDATE_CONFIG_SISTEMA' : 'CREATE_CONFIG_SISTEMA',
        entidade: 'ConfiguracaoSistema',
        entidadeId: 'singleton',
        utilizadorId: session.user.id,
        detalhes: {
          ...(scalarChanges ?? {}),
          ...(arrayChanged && {
            inqueritoFiltroEstadosDefault: {
              before: before?.inqueritoFiltroEstadosDefault ?? null,
              after: config.inqueritoFiltroEstadosDefault,
            },
          }),
          ...(passwordChanged && {
            smtpPassword: {
              before: before?.smtpPasswordEnc ? '***' : null,
              after: config.smtpPasswordEnc ? '***' : null,
            },
          }),
        } as never,
      })
    }

    return Response.json(publicConfig(config))
  } catch (error) {
    return handleApiError(error)
  }
}
