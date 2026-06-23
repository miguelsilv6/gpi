import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { isModuloAnexosAtivo } from '@/lib/anexos-module'
import {
  searchInqueritos,
  searchNotas,
  searchAtividades,
  searchDocumentos,
} from '@/lib/search'
import type { Role } from '@/generated/prisma/enums'

// Pesquisa global (paleta de comandos / Cmd+K). Agrega inquéritos (por NUIPC,
// NAI, denunciante e etiqueta) e resultados full-text de notas e atividades,
// além de documentos por nome. Todo o âmbito por role é aplicado em src/lib/search.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    // Qualquer perfil que possa ler inquéritos pode usar a pesquisa; o âmbito
    // é restringido por role em cada função de pesquisa.
    if (
      !hasPermission(role, 'inquerito:read:own') &&
      !hasPermission(role, 'inquerito:read:all')
    ) {
      return apiError('Sem permissão', 403)
    }

    const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
    if (q.length < 2) {
      return Response.json({ inqueritos: [], notas: [], atividades: [], documentos: [] })
    }

    const userId = session.user.id
    const brigadaId = session.user.brigadaId ?? null
    const anexosAtivo = await isModuloAnexosAtivo(role)

    const [inqueritos, notas, atividades, documentos] = await Promise.all([
      searchInqueritos(q, role, userId, brigadaId),
      searchNotas(q, role, userId, brigadaId),
      searchAtividades(q, role, userId, brigadaId),
      anexosAtivo ? searchDocumentos(q, role, userId, brigadaId) : Promise.resolve([]),
    ])

    return Response.json({ inqueritos, notas, atividades, documentos })
  } catch (error) {
    return handleApiError(error)
  }
}
