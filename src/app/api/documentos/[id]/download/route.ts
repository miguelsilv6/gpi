import { NextRequest } from 'next/server'
import { createReadStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import { Readable } from 'node:stream'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { documentoPath } from '@/lib/documentos'
import type { Role } from '@/generated/prisma/enums'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { id } = await params

    const documento = await prisma.documento.findFirst({
      where: {
        id,
        inquerito: {
          deletedAt: null,
          ...buildInqueritoWhere(role, session.user.id, session.user.brigadaId ?? null),
        },
      },
      select: { filename: true, storedName: true, mimeType: true, tamanho: true },
    })
    if (!documento) return apiError('Documento não encontrado', 404)

    const filePath = documentoPath(documento.storedName)
    try {
      await fs.access(filePath)
    } catch {
      return apiError('Ficheiro não encontrado em disco', 410)
    }

    // RFC 5987 para nomes com caracteres não-ASCII.
    const asciiName = documento.filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
    const utf8Name = encodeURIComponent(documento.filename)

    const fileStream = createReadStream(filePath)

    return new Response(Readable.toWeb(fileStream) as ReadableStream, {
      headers: {
        'Content-Type': documento.mimeType,
        'Content-Length': String(documento.tamanho),
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
