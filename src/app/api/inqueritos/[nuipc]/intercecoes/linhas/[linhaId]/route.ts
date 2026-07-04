import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit, diff } from '@/lib/audit'
import { loadIntercecaoContext, parseData } from '@/lib/intercecoes-api'
import {
  intercecaoLinhaUpdateSchema,
  resetAlertFlagsOnUpdate,
} from '@/lib/validations/intercecao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function loadLinha(linhaId: string, inqueritoId: string) {
  const linha = await prisma.intercecaoLinha.findUnique({
    where: { id: linhaId },
    include: { alvo: { select: { id: true, codigo: true, inqueritoid: true } } },
  })
  if (!linha || linha.alvo.inqueritoid !== inqueritoId) return null
  return linha
}

/** PUT — atualizar uma linha. Mudar dataFim/alertaDias repõe os flags de aviso. */
export async function PUT(
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
    const parsed = intercecaoLinhaUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }
    const d = parsed.data

    // Datas: valida a combinação FINAL (existente + alterações).
    let dataInicio: Date | undefined
    let dataFim: Date | undefined
    if (d.dataInicio !== undefined) {
      const v = parseData(d.dataInicio)
      if (!v) return apiError('Data de início inválida', 400)
      dataInicio = v
    }
    if (d.dataFim !== undefined) {
      const v = parseData(d.dataFim)
      if (!v) return apiError('Data de fim inválida', 400)
      dataFim = v
    }
    const inicioFinal = dataInicio ?? linha.dataInicio
    const fimFinal = dataFim ?? linha.dataFim
    if (fimFinal.getTime() < inicioFinal.getTime()) {
      return apiError('A data de fim não pode ser anterior à de início', 400)
    }

    // Reposição dos flags: mudar o fim reabre os 2 avisos; mudar os dias de um
    // aviso reabre esse aviso (senão, adiar o fim nunca voltaria a alertar).
    const reset = resetAlertFlagsOnUpdate(
      { dataFim: linha.dataFim, alertaDias1: linha.alertaDias1, alertaDias2: linha.alertaDias2 },
      { dataFim, alertaDias1: d.alertaDias1, alertaDias2: d.alertaDias2 },
    )

    const updated = await prisma.intercecaoLinha.update({
      where: { id: linha.id },
      data: {
        ...(d.tipo !== undefined && { tipo: d.tipo }),
        ...(d.identificador !== undefined && { identificador: d.identificador }),
        ...(d.rede !== undefined && { rede: d.rede.trim() || null }),
        ...(dataInicio !== undefined && { dataInicio }),
        ...(dataFim !== undefined && { dataFim }),
        ...(d.alertaDias1 !== undefined && { alertaDias1: d.alertaDias1 }),
        ...(d.alertaDias2 !== undefined && { alertaDias2: d.alertaDias2 }),
        ...(d.observacoes !== undefined && { observacoes: d.observacoes.trim() || null }),
        ...reset,
      },
    })

    const keys = ['tipo', 'identificador', 'rede', 'dataInicio', 'dataFim', 'alertaDias1', 'alertaDias2', 'observacoes'] as const
    const changes = diff(
      Object.fromEntries(keys.map((k) => [k, linha[k]])) as Record<string, string | number | Date | null>,
      Object.fromEntries(keys.map((k) => [k, updated[k]])) as Record<string, string | number | Date | null>,
      keys,
    )
    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_INTERCECAO_LINHA',
        entidade: 'IntercecaoLinha',
        entidadeId: linha.id,
        utilizadorId: ctx.userId,
        detalhes: { nuipc: ctx.inquerito.nuipc, alvoCodigo: linha.alvo.codigo, ...changes } as never,
      })
    }

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

/** DELETE — eliminar uma linha (produtos ficam, com linha a null). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; linhaId: string }> },
) {
  try {
    const { nuipc: slug, linhaId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const linha = await loadLinha(linhaId, ctx.inquerito.id)
    if (!linha) return apiError('Linha não encontrada', 404)

    await prisma.intercecaoLinha.delete({ where: { id: linha.id } })

    await writeAudit({
      req,
      acao: 'DELETE_INTERCECAO_LINHA',
      entidade: 'IntercecaoLinha',
      entidadeId: linha.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        alvoCodigo: linha.alvo.codigo,
        tipo: linha.tipo,
        identificador: linha.identificador,
      },
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
