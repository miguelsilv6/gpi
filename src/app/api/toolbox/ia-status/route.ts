import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { ollamaStatus, OLLAMA_URL } from '@/lib/toolbox/llm'
import type { Role } from '@/generated/prisma/enums'

/** Estado do serviço de IA (Ollama online? modelo descarregado?). Só admin. */
export async function GET() {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) return apiError('Sem permissão', 403)

    const config = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { toolboxIaModelo: true },
    })
    const modelo = config?.toolboxIaModelo ?? 'qwen3:4b'
    const status = await ollamaStatus(modelo)
    return Response.json({ modelo, ...status })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * Descarrega o modelo configurado no Ollama (proxy de /api/pull). Operação
 * longa (vários GB) — corre de forma síncrona com timeout largo; o admin
 * verifica o estado com o GET.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) return apiError('Sem permissão', 403)

    const config = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { toolboxIaModelo: true },
    })
    const modelo = config?.toolboxIaModelo ?? 'qwen3:4b'

    let res: Response
    try {
      res = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelo, stream: false }),
        // Download de vários GB — timeout generoso.
        signal: AbortSignal.timeout(15 * 60_000),
        cache: 'no-store',
      })
    } catch {
      return apiError('Serviço de IA indisponível — verifique se o container Ollama está a correr', 503)
    }
    if (!res.ok) {
      return apiError(`Falha ao descarregar o modelo "${modelo}" — confirme o nome e o acesso à internet`, 502)
    }

    await writeAudit({
      req,
      acao: 'TOOLBOX_IA_PULL_MODELO',
      entidade: 'Toolbox',
      entidadeId: modelo,
      utilizadorId: session.user.id,
      detalhes: { modelo },
    })

    return Response.json({ ok: true, modelo })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
