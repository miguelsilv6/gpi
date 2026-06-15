import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { RATE_LIMITS } from '@/lib/constants'
import {
  ALLOWED_MIME_LOGO,
  ALL_EXTENSIONS,
  BRANDING_DIR,
  MAX_UPLOAD_BYTES,
  brandingFilename,
  extensionFromMime,
  type LogoVariant,
} from '@/lib/branding'
import { validateImageMagic } from '@/lib/branding-validate'
import type { Role } from '@/generated/prisma/enums'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseVariant(req: NextRequest): LogoVariant | null {
  const v = new URL(req.url).searchParams.get('variant')
  return v === 'light' || v === 'dark' || v === 'horizontal-light' || v === 'horizontal-dark'
    ? (v as LogoVariant)
    : null
}

const SLOT_MAP = {
  'light': 'logo-light',
  'dark': 'logo-dark',
  'horizontal-light': 'logo-horizontal-light',
  'horizontal-dark': 'logo-horizontal-dark',
} as const

const FIELD_MAP = {
  'light': 'logoLightFilename',
  'dark': 'logoDarkFilename',
  'horizontal-light': 'logoHorizontalLightFilename',
  'horizontal-dark': 'logoHorizontalDarkFilename',
} as const

/**
 * Upload de logo (variant=light|dark|horizontal-light|horizontal-dark). Validações:
 *   - admin + rate limit HEAVY_OPERATIONS
 *   - mime em ALLOWED_MIME_LOGO
 *   - tamanho ≤ 1 MB
 *   - magic bytes consistentes com o mime (rejeita SVG mascarado de PNG, etc.)
 *
 * Apaga ficheiros antigos do mesmo slot (ex: `logo-light.svg` se já existir
 * quando se carrega um novo `logo-light.png`) para evitar lixo no disco.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão para alterar a aparência', 403)
    }

    const variant = parseVariant(req)
    if (!variant) return apiError('Variante inválida (light|dark)', 400)

    const limited = enforceRateLimit({
      key: `branding:logo:${clientFingerprint(req)}:${session.user.id}`,
      ...RATE_LIMITS.HEAVY_OPERATIONS,
    })
    if (limited) return limited

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return apiError('Ficheiro em falta', 400)
    if (file.size === 0) return apiError('Ficheiro vazio', 400)
    if (file.size > MAX_UPLOAD_BYTES) {
      return apiError(`Ficheiro demasiado grande (limite ${MAX_UPLOAD_BYTES} bytes)`, 413)
    }
    if (!(ALLOWED_MIME_LOGO as readonly string[]).includes(file.type)) {
      return apiError(`Tipo MIME não suportado: ${file.type}`, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (!validateImageMagic(buffer, file.type)) {
      return apiError('Conteúdo do ficheiro não corresponde ao tipo declarado', 400)
    }

    const ext = extensionFromMime(file.type)
    if (!ext) return apiError('Extensão não suportada', 400)

    await fs.mkdir(BRANDING_DIR, { recursive: true })

    // Limpa ficheiros antigos do mesmo slot (extensões diferentes).
    const slot = SLOT_MAP[variant]
    await Promise.all(
      ALL_EXTENSIONS.map((e) =>
        fs.unlink(path.join(BRANDING_DIR, `${slot}.${e}`)).catch(() => {}),
      ),
    )

    const filename = brandingFilename(slot, ext)
    await fs.writeFile(path.join(BRANDING_DIR, filename), buffer, { mode: 0o644 })

    const field = FIELD_MAP[variant]
    const now = new Date()
    await prisma.configuracaoSistema.upsert({
      where: { id: 'singleton' },
      update: { [field]: filename, brandUpdatedAt: now },
      create: { id: 'singleton', [field]: filename, brandUpdatedAt: now },
    })

    await writeAudit({
      req,
      acao: 'UPDATE_BRANDING',
      entidade: 'ConfiguracaoSistema',
      entidadeId: 'singleton',
      utilizadorId: session.user.id,
      detalhes: { kind: 'logo', variant, filename, size: buffer.length } as never,
    })

    return Response.json({ filename, size: buffer.length })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * Apaga o logo da variante indicada e limpa a coluna correspondente.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão', 403)
    }

    const variant = parseVariant(req)
    if (!variant) return apiError('Variante inválida (light|dark)', 400)

    const slot = SLOT_MAP[variant]
    await Promise.all(
      ALL_EXTENSIONS.map((e) =>
        fs.unlink(path.join(BRANDING_DIR, `${slot}.${e}`)).catch(() => {}),
      ),
    )

    const field = FIELD_MAP[variant]
    await prisma.configuracaoSistema.upsert({
      where: { id: 'singleton' },
      update: { [field]: null, brandUpdatedAt: new Date() },
      create: { id: 'singleton', [field]: null, brandUpdatedAt: new Date() },
    })

    await writeAudit({
      req,
      acao: 'UPDATE_BRANDING',
      entidade: 'ConfiguracaoSistema',
      entidadeId: 'singleton',
      utilizadorId: session.user.id,
      detalhes: { kind: 'logo', variant, action: 'removed' } as never,
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
