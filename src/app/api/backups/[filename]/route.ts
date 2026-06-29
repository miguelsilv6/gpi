import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { resolveBackupPath } from '@/lib/backups'
import type { Role } from '@/generated/prisma/enums'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão para gerir backups', 403)
    }

    const { filename } = await params
    const filePath = resolveBackupPath(filename)
    if (!filePath) return apiError('Filename inválido', 400)

    let size = 0
    try {
      const stat = await fs.stat(filePath)
      size = stat.size
    } catch {
      return apiError('Backup não encontrado', 404)
    }

    await fs.unlink(filePath)
    // Remove também o arquivo companion de anexos, se existir (best-effort).
    await fs.unlink(filePath.replace(/\.sql\.gz$/, '.files.tar.gz')).catch(() => {})

    await prisma.auditLog.create({
      data: {
        acao: 'DELETE_BACKUP',
        entidade: 'Sistema',
        entidadeId: filename,
        utilizadorId: session.user.id,
        detalhes: { filename, size } as never,
      },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
