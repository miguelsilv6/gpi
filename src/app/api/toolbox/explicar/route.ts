import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { isModuloToolboxAtivo } from '@/lib/toolbox-module'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { writeAudit } from '@/lib/audit'
import { buildExplainPrompt, ollamaGenerate, type FerramentaExplicavel } from '@/lib/toolbox/llm'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  ferramenta: z.enum(['ip', 'dns', 'whois', 'certs', 'wayback', 'email-headers']),
  resultado: z.unknown(),
})

/**
 * Explicação por IA de um resultado da Toolbox. O LLM corre localmente
 * (container Ollama) — os dados nunca saem do servidor. Funciona sobre o
 * resultado que o cliente já obteve da ferramenta correspondente.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloToolboxAtivo(role))) {
      return apiError('O módulo Toolbox está desativado', 503)
    }

    const config = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { toolboxIaAtivo: true, toolboxIaModelo: true },
    })
    if (!config?.toolboxIaAtivo) {
      return apiError('As explicações por IA estão desativadas', 503)
    }

    // Inferência em CPU é cara — limite apertado por utilizador.
    const limited = enforceRateLimit({
      key: `toolbox:ia:${clientFingerprint(req)}:${session.user.id}`,
      max: 5,
      windowMs: 60_000,
    })
    if (limited) return limited

    const raw = await req.text()
    if (raw.length > 64_000) return apiError('Pedido demasiado grande', 413)
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      return apiError('JSON inválido', 400)
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const ferramenta = parsed.data.ferramenta as FerramentaExplicavel
    const prompt = buildExplainPrompt(ferramenta, parsed.data.resultado)

    let explicacao: string
    try {
      explicacao = await ollamaGenerate(prompt, config.toolboxIaModelo)
    } catch (error) {
      // ollamaGenerate lança mensagens amigáveis com status em cause —
      // devolvê-las diretamente (handleApiError mascararia os 5xx).
      if (error instanceof Error && typeof error.cause === 'number') {
        return apiError(error.message, error.cause)
      }
      throw error
    }

    await writeAudit({
      req,
      acao: 'TOOLBOX_IA_EXPLICACAO',
      entidade: 'Toolbox',
      entidadeId: ferramenta,
      utilizadorId: session.user.id,
      detalhes: { ferramenta, modelo: config.toolboxIaModelo },
    })

    return Response.json({
      explicacao,
      modelo: config.toolboxIaModelo,
      fonte: `IA local (${config.toolboxIaModelo} via Ollama) — os dados não saem do servidor`,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
