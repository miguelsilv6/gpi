import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadIntercecaoContext, parseData } from '@/lib/intercecoes-api'
import {
  intercecaoLinhaCreateSchema,
  INTERCECAO_ALERTA1_DEFAULT,
  INTERCECAO_ALERTA2_DEFAULT,
} from '@/lib/validations/intercecao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST — criar uma linha intercetada (SIM/IMEI) num alvo. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; alvoId: string }> },
) {
  try {
    const { nuipc: slug, alvoId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const alvo = await prisma.intercecaoAlvo.findUnique({
      where: { id: alvoId },
      select: { id: true, nome: true, inqueritoid: true },
    })
    if (!alvo || alvo.inqueritoid !== ctx.inquerito.id) {
      return apiError('Alvo não encontrado', 404)
    }

    const body = await req.json().catch(() => null)
    const parsed = intercecaoLinhaCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }
    const d = parsed.data

    const dataInicio = parseData(d.dataInicio)
    const dataFim = parseData(d.dataFim)
    if (!dataInicio || !dataFim) return apiError('Data inválida', 400)
    if (dataFim.getTime() < dataInicio.getTime()) {
      return apiError('A data de fim não pode ser anterior à de início', 400)
    }

    // Pré-verificação para mensagem PT amigável; o @@unique é o backstop.
    const duplicado = await prisma.intercecaoLinha.findFirst({
      where: { alvoId: alvo.id, codigo: d.codigo },
      select: { id: true },
    })
    if (duplicado) {
      return apiError('Já existe uma linha com este código neste alvo', 409)
    }

    const linha = await prisma.intercecaoLinha.create({
      data: {
        alvoId: alvo.id,
        codigo: d.codigo,
        tipo: d.tipo,
        identificador: d.identificador,
        rede: d.rede ?? null,
        dataInicio,
        dataFim,
        // undefined = usar default; null explícito = aviso desligado.
        alertaDias1: d.alertaDias1 === undefined ? INTERCECAO_ALERTA1_DEFAULT : d.alertaDias1,
        alertaDias2: d.alertaDias2 === undefined ? INTERCECAO_ALERTA2_DEFAULT : d.alertaDias2,
        observacoes: d.observacoes ?? null,
      },
    })

    await writeAudit({
      req,
      acao: 'CREATE_INTERCECAO_LINHA',
      entidade: 'IntercecaoLinha',
      entidadeId: linha.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        alvoNome: alvo.nome,
        codigo: linha.codigo,
        tipo: linha.tipo,
        identificador: linha.identificador,
        dataInicio: linha.dataInicio.toISOString(),
        dataFim: linha.dataFim.toISOString(),
      },
    })

    return Response.json(linha)
  } catch (error) {
    return handleApiError(error)
  }
}
