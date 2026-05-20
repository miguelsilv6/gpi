import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { BACKUP_DIR } from '@/lib/backups'
import type { Role } from '@/generated/prisma/enums'

const MAX_BYTES = 500 * 1024 * 1024 // 500 MB

/**
 * Upload de um ficheiro .sql.gz externo (e.g. trazido de outro servidor).
 * Renomeamos sempre para `gpi_backup_<ts>.sql.gz` no momento do save, para
 * garantir conformidade com o regex do resto da API. Magic-byte check
 * (1F 8B) confirma que é gzip antes de gravar.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão', 403)
    }

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return apiError('Ficheiro em falta', 400)
    }
    if (file.size === 0) return apiError('Ficheiro vazio', 400)
    if (file.size > MAX_BYTES) {
      return apiError(`Ficheiro demasiado grande (limite ${MAX_BYTES} bytes)`, 413)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    // Magic bytes do gzip: 1F 8B
    if (buffer.length < 2 || buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
      return apiError('Ficheiro inválido — apenas .sql.gz é aceite', 400)
    }

    // Renome forçado para o padrão do sistema. Timestamp em UTC.
    const now = new Date()
    const ts =
      now.getUTCFullYear().toString() +
      String(now.getUTCMonth() + 1).padStart(2, '0') +
      String(now.getUTCDate()).padStart(2, '0') +
      '_' +
      String(now.getUTCHours()).padStart(2, '0') +
      String(now.getUTCMinutes()).padStart(2, '0') +
      String(now.getUTCSeconds()).padStart(2, '0')
    const filename = `gpi_backup_${ts}.sql.gz`
    const filePath = path.join(BACKUP_DIR, filename)

    await fs.mkdir(BACKUP_DIR, { recursive: true })
    await fs.writeFile(filePath, buffer, { mode: 0o644 })

    await prisma.auditLog.create({
      data: {
        acao: 'UPLOAD_BACKUP',
        entidade: 'Sistema',
        entidadeId: filename,
        utilizadorId: session.user.id,
        detalhes: {
          filename,
          size: buffer.length,
          originalName: file.name,
        } as never,
      },
    })

    return Response.json({ filename, size: buffer.length })
  } catch (error) {
    return handleApiError(error)
  }
}

// Aumentar o limite padrão do body para o upload.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
