import { NextRequest } from 'next/server'
import { createReadStream, promises as fs } from 'node:fs'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { resolveBackupPath } from '@/lib/backups'
import type { Role } from '@/generated/prisma/enums'

/**
 * Stream do ficheiro de backup. Auditado em separado — o dump contém PII e
 * hashes de password, portanto download é um evento sensível.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão para descarregar backups', 403)
    }

    const { filename } = await params
    const filePath = resolveBackupPath(filename)
    if (!filePath) return apiError('Filename inválido', 400)

    let size: number
    try {
      const stat = await fs.stat(filePath)
      size = stat.size
    } catch {
      return apiError('Backup não encontrado', 404)
    }

    await prisma.auditLog.create({
      data: {
        acao: 'DOWNLOAD_BACKUP',
        entidade: 'Sistema',
        entidadeId: filename,
        utilizadorId: session.user.id,
        detalhes: { filename, size },
      },
    })

    // Convert Node stream to a Web ReadableStream so we can hand it to Response.
    const nodeStream = createReadStream(filePath)
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        nodeStream.on('data', (chunk) =>
          controller.enqueue(
            chunk instanceof Buffer ? new Uint8Array(chunk) : new TextEncoder().encode(String(chunk)),
          ),
        )
        nodeStream.on('end', () => controller.close())
        nodeStream.on('error', (err) => controller.error(err))
      },
      cancel() {
        nodeStream.destroy()
      },
    })

    return new Response(webStream, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': String(size),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
