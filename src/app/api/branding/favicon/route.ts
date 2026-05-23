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
  ALLOWED_MIME_FAVICON,
  ALL_EXTENSIONS,
  BRANDING_DIR,
  MAX_UPLOAD_BYTES,
  brandingFilename,
  extensionFromMime,
} from '@/lib/branding'
import { validateImageMagic } from '@/lib/branding-validate'
import type { Role } from '@/generated/prisma/enums'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Upload do favicon. Aceita PNG, JPEG, WEBP, SVG e ICO. Mesma validação
 * que logos + magic bytes.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão para alterar a aparência', 403)
    }

    const limited = enforceRateLimit({
      key: `branding:favicon:${clientFingerprint(req)}:${session.user.id}`,
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
    if (!(ALLOWED_MIME_FAVICON as readonly string[]).includes(file.type)) {
      return apiError(`Tipo MIME não suportado: ${file.type}`, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (!validateImageMagic(buffer, file.type)) {
      return apiError('Conteúdo do ficheiro não corresponde ao tipo declarado', 400)
    }

    const ext = extensionFromMime(file.type)
    if (!ext) return apiError('Extensão não suportada', 400)

    await fs.mkdir(BRANDING_DIR, { recursive: true })

    await Promise.all(
      ALL_EXTENSIONS.map((e) =>
        fs.unlink(path.join(BRANDING_DIR, `favicon.${e}`)).catch(() => {}),
      ),
    )

    const filename = brandingFilename('favicon', ext)
    await fs.writeFile(path.join(BRANDING_DIR, filename), buffer, { mode: 0o644 })

    const now = new Date()
    await prisma.configuracaoSistema.upsert({
      where: { id: 'singleton' },
      update: { faviconFilename: filename, brandUpdatedAt: now },
      create: { id: 'singleton', faviconFilename: filename, brandUpdatedAt: now },
    })

    await writeAudit({
      req,
      acao: 'UPDATE_BRANDING',
      entidade: 'ConfiguracaoSistema',
      entidadeId: 'singleton',
      utilizadorId: session.user.id,
      detalhes: { kind: 'favicon', filename, size: buffer.length } as never,
    })

    return Response.json({ filename, size: buffer.length })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão', 403)
    }

    await Promise.all(
      ALL_EXTENSIONS.map((e) =>
        fs.unlink(path.join(BRANDING_DIR, `favicon.${e}`)).catch(() => {}),
      ),
    )

    await prisma.configuracaoSistema.upsert({
      where: { id: 'singleton' },
      update: { faviconFilename: null, brandUpdatedAt: new Date() },
      create: { id: 'singleton', faviconFilename: null, brandUpdatedAt: new Date() },
    })

    await writeAudit({
      req,
      acao: 'UPDATE_BRANDING',
      entidade: 'ConfiguracaoSistema',
      entidadeId: 'singleton',
      utilizadorId: session.user.id,
      detalhes: { kind: 'favicon', action: 'removed' } as never,
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
