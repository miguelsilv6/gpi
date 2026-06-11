import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { documentoPath } from '@/lib/documentos'
import type { Role } from '@/generated/prisma/enums'

/** Carrega o documento se o utilizador tiver acesso de leitura ao inquérito pai. */
async function findDocumentoWithAccess(id: string, role: Role, userId: string, brigadaId: string | null) {
  return prisma.documento.findFirst({
    where: {
      id,
      inquerito: {
        deletedAt: null,
        ...buildInqueritoWhere(role, userId, brigadaId),
      },
    },
    select: {
      id: true,
      filename: true,
      storedName: true,
      mimeType: true,
      tamanho: true,
      uploadedById: true,
      inquerito: { select: { nuipc: true } },
    },
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { id } = await params

    const documento = await findDocumentoWithAccess(id, role, session.user.id, session.user.brigadaId ?? null)
    if (!documento) return apiError('Documento não encontrado', 404)

    // Só quem carregou o documento (ou quem pode editar tudo) pode eliminá-lo.
    if (documento.uploadedById !== session.user.id && !hasPermission(role, 'inquerito:edit:all')) {
      return apiError('Sem permissão para eliminar este documento', 403)
    }

    await prisma.documento.delete({ where: { id } })
    await fs.unlink(documentoPath(documento.storedName)).catch(() => {
      // Ficheiro já não existe em disco — a linha da BD era a fonte de verdade.
    })

    await writeAudit({
      req,
      acao: 'DELETE_DOCUMENTO',
      entidade: 'Documento',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { filename: documento.filename, nuipc: documento.inquerito.nuipc },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
