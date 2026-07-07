import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadIntercecaoContext, parseData } from '@/lib/intercecoes-api'
import { intercecaoRenovarSchema, resetAlertFlagsOnUpdate } from '@/lib/validations/intercecao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function loadLinha(linhaId: string, inqueritoId: string) {
  const linha = await prisma.intercecaoLinha.findUnique({
    where: { id: linhaId },
    include: { alvo: { select: { id: true, nome: true, inqueritoid: true } } },
  })
  if (!linha || linha.alvo.inqueritoid !== inqueritoId) return null
  return linha
}

/**
 * POST — renovar (prorrogar) uma linha: avança a data de fim, incrementa o
 * contador de renovações e repõe os flags de aviso (para voltar a alertar
 * perto do novo fim). A nova data tem de ser posterior à data de fim atual.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; linhaId: string }> },
) {
  try {
    const { nuipc: slug, linhaId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const linha = await loadLinha(linhaId, ctx.inquerito.id)
    if (!linha) return apiError('Linha não encontrada', 404)

    const body = await req.json().catch(() => null)
    const parsed = intercecaoRenovarSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }

    const novaDataFim = parseData(parsed.data.novaDataFim)
    if (!novaDataFim) return apiError('Nova data de fim inválida', 400)
    if (novaDataFim.getTime() <= linha.dataFim.getTime()) {
      return apiError('A nova data de fim tem de ser posterior à atual', 400)
    }

    // Renovar prorroga o fim: reabre sempre os dois avisos para o novo prazo.
    const reset = resetAlertFlagsOnUpdate(
      { dataFim: linha.dataFim, alertaDias1: linha.alertaDias1, alertaDias2: linha.alertaDias2 },
      { dataFim: novaDataFim },
    )

    const updated = await prisma.intercecaoLinha.update({
      where: { id: linha.id },
      data: {
        dataFim: novaDataFim,
        renovacoes: { increment: 1 },
        ...reset,
      },
    })

    await writeAudit({
      req,
      acao: 'RENOVAR_INTERCECAO_LINHA',
      entidade: 'IntercecaoLinha',
      entidadeId: linha.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        alvoNome: linha.alvo.nome,
        codigo: linha.codigo,
        identificador: linha.identificador,
        dataFim: { changed: true, before: linha.dataFim, after: novaDataFim },
        renovacoes: { changed: true, before: linha.renovacoes, after: updated.renovacoes },
      } as never,
    })

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}
