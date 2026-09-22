import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadIntercecaoContext } from '@/lib/intercecoes-api'
import { VALIDACAO_SELECT } from '@/lib/intercecoes-validacoes'
import { intercecaoValidacaoUpdateSchema } from '@/lib/validations/intercecao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PUT — marcar/desmarcar uma validação como feita (o ✓ da coluna "FEITO") e
 * anotar observações.
 *
 * Marcar como feita trava os avisos desta validação; desmarcar volta a
 * abri-los, para o caso de a apresentação ter sido dada como feita por engano.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; validacaoId: string }> },
) {
  try {
    const { nuipc: slug, validacaoId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const validacao = await prisma.intercecaoValidacao.findUnique({
      where: { id: validacaoId },
      select: {
        id: true,
        numero: true,
        feitaEm: true,
        plano: { select: { inqueritoid: true } },
      },
    })
    if (!validacao || validacao.plano.inqueritoid !== ctx.inquerito.id) {
      return apiError('Validação não encontrada', 404)
    }

    const body = await req.json().catch(() => null)
    const parsed = intercecaoValidacaoUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }
    const d = parsed.data

    const updated = await prisma.intercecaoValidacao.update({
      where: { id: validacao.id },
      data: {
        ...(d.feita !== undefined &&
          (d.feita
            ? { feitaEm: validacao.feitaEm ?? new Date(), feitaPorId: ctx.userId }
            : {
                feitaEm: null,
                feitaPorId: null,
                // Desmarcar reabre os avisos desta validação.
                alertaEnviado: false,
                alertaRenovacaoEnviado: false,
              })),
        ...(d.observacoes !== undefined && { observacoes: d.observacoes.trim() || null }),
      },
      select: VALIDACAO_SELECT,
    })

    if (d.feita !== undefined && d.feita !== (validacao.feitaEm !== null)) {
      await writeAudit({
        req,
        acao: d.feita ? 'MARCAR_INTERCECAO_VALIDACAO' : 'DESMARCAR_INTERCECAO_VALIDACAO',
        entidade: 'IntercecaoValidacao',
        entidadeId: validacao.id,
        utilizadorId: ctx.userId,
        detalhes: { nuipc: ctx.inquerito.nuipc, numero: validacao.numero },
      })
    }

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
