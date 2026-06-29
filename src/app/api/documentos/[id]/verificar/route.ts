import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { isModuloAnexosAtivo } from '@/lib/anexos-module'
import { documentoPath, sha256OfFile } from '@/lib/documentos'
import { writeAudit } from '@/lib/audit'
import type { Role } from '@/generated/prisma/enums'

/**
 * Verifica a integridade de um documento: recalcula o SHA-256 do ficheiro em
 * disco e compara com o hash de referência guardado no upload. Acessível a quem
 * pode ler o inquérito; registado no AuditLog (cadeia de custódia).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloAnexosAtivo(role))) return apiError('Módulo de anexos desativado', 503)
    const { id } = await params

    const documento = await prisma.documento.findFirst({
      where: {
        id,
        inquerito: {
          deletedAt: null,
          ...buildInqueritoWhere(role, session.user.id, session.user.brigadaId ?? null),
        },
      },
      select: { id: true, filename: true, storedName: true, sha256: true },
    })
    if (!documento) return apiError('Documento não encontrado', 404)

    const filePath = documentoPath(documento.storedName)
    try {
      await fs.access(filePath)
    } catch {
      return apiError('Ficheiro não encontrado em disco', 410)
    }

    const computed = await sha256OfFile(filePath)
    const hasReference = documento.sha256 != null
    const match = hasReference ? computed === documento.sha256 : null

    await writeAudit({
      req,
      acao: 'VERIFY_DOCUMENTO',
      entidade: 'Documento',
      entidadeId: documento.id,
      utilizadorId: session.user.id,
      detalhes: { filename: documento.filename, match, hasReference },
    }).catch(() => {})

    return Response.json({ hasReference, match, stored: documento.sha256, computed })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
