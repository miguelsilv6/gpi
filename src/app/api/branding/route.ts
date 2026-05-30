import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit, diff } from '@/lib/audit'
import { getBrand, BRAND_DEFAULTS } from '@/lib/brand'
import type { Role } from '@/generated/prisma/enums'

/**
 * GET — público. Permite que a página de login (sem sessão) e qualquer
 * cliente leia o brand actual.
 */
export async function GET() {
  try {
    const brand = await getBrand()
    return Response.json(brand)
  } catch (error) {
    return handleApiError(error)
  }
}

const updateSchema = z.object({
  appName: z.string().min(1).max(40).nullable().optional(),
  appShortName: z.string().min(1).max(10).nullable().optional(),
  appDescription: z.string().min(1).max(120).nullable().optional(),
  manifestDescription: z.string().min(1).max(200).nullable().optional(),
  pdfFooterText: z.string().min(1).max(120).nullable().optional(),
  appAuthor: z.string().max(120).nullable().optional(),
})

const TEXT_FIELDS = [
  'appName',
  'appShortName',
  'appDescription',
  'manifestDescription',
  'pdfFooterText',
  'appAuthor',
] as const

/**
 * PUT — admin. Atualiza colunas textuais. Cada campo é opcional; passar
 * `null` num campo equivale a "repor default". `brandUpdatedAt` é bump'd
 * automaticamente para invalidar caches de browser nos assets servidos
 * por `/branding/[file]`.
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão para personalizar a aplicação', 403)
    }

    const body = await req.json().catch(() => ({}))
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(`Dados inválidos: ${parsed.error.issues[0]?.message ?? ''}`, 400)
    }

    const before = await getBrand()

    const updateData: Record<string, string | Date | null> = {}
    for (const field of TEXT_FIELDS) {
      if (field in parsed.data) {
        updateData[field] = parsed.data[field] ?? null
      }
    }
    updateData.brandUpdatedAt = new Date()

    await prisma.configuracaoSistema.upsert({
      where: { id: 'singleton' },
      update: updateData,
      create: { id: 'singleton', ...updateData },
    })

    const after = await getBrand()
    const d = diff(
      { ...before, brandUpdatedAt: null },
      { ...after, brandUpdatedAt: null },
      TEXT_FIELDS,
    )
    if (d) {
      await writeAudit({
        req,
        acao: 'UPDATE_BRANDING',
        entidade: 'ConfiguracaoSistema',
        entidadeId: 'singleton',
        utilizadorId: session.user.id,
        detalhes: { ...d, defaults: BRAND_DEFAULTS } as never,
      })
    }

    return Response.json(after)
  } catch (error) {
    return handleApiError(error)
  }
}
