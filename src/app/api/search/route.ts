import { NextRequest } from 'next/server'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { isModuloAnexosAtivo } from '@/lib/anexos-module'
import { isModuloIntercecoesAtivo } from '@/lib/intercecoes-module'
import { isModuloApreensoesAtivo } from '@/lib/apreensoes-module'
import { isModuloPericiasAtivo } from '@/lib/pericias-module'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import {
  searchInqueritos,
  searchNotas,
  searchAtividades,
  searchDocumentos,
  searchOutros,
} from '@/lib/search'
import type { Role } from '@/generated/prisma/enums'

// Pesquisa global (paleta de comandos / Cmd+K). Agrega inquéritos (por NUIPC,
// NAI, denunciante e etiqueta) e resultados full-text de notas e atividades,
// além de documentos por nome e de intervenientes, números intercetados,
// apreensões, perícias e tarefas próprias. Todo o âmbito por role é aplicado
// em src/lib/search.

/** Termos maiores não fazem sentido numa pesquisa rápida e custam caro. */
const MAX_QUERY = 100
const VAZIO = { inqueritos: [], notas: [], atividades: [], documentos: [], outros: [] }

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

    const q = (new URL(req.url).searchParams.get('q')?.trim() ?? '').slice(0, MAX_QUERY)
    if (q.length < 2) return Response.json(VAZIO)

    // A paleta pesquisa enquanto se escreve (com debounce): limite generoso,
    // mas trava abusos — cada pedido corre ~9 consultas.
    const limited = enforceRateLimit({
      key: `search:${clientFingerprint(req)}:${session.user.id}`,
      max: 60,
      windowMs: 60_000,
    })
    if (limited) return limited

    const userId = session.user.id
    const brigadaId = session.user.brigadaId ?? null
    const [anexosAtivo, intercecoes, apreensoes, pericias] = await Promise.all([
      isModuloAnexosAtivo(role),
      isModuloIntercecoesAtivo(role),
      isModuloApreensoesAtivo(role),
      isModuloPericiasAtivo(role),
    ])

    const [inqueritos, notas, atividades, documentos, outros] = await Promise.all([
      searchInqueritos(q, role, userId, brigadaId),
      searchNotas(q, role, userId, brigadaId),
      searchAtividades(q, role, userId, brigadaId),
      anexosAtivo ? searchDocumentos(q, role, userId, brigadaId) : Promise.resolve([]),
      searchOutros(q, role, userId, brigadaId, { intercecoes, apreensoes, pericias }),
    ])

    return Response.json({ inqueritos, notas, atividades, documentos, outros })
  } catch (error) {
    return handleApiError(error)
  }
}
