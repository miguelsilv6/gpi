import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadIntercecaoContext, parseData } from '@/lib/intercecoes-api'
import { OUVIDO_ATE_SELECT } from '@/lib/intercecoes'
import { intercecaoOuvidoAteSchema } from '@/lib/validations/intercecao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

async function loadLinha(linhaId: string, inqueritoId: string) {
  const linha = await prisma.intercecaoLinha.findUnique({
    where: { id: linhaId },
    select: {
      id: true,
      codigo: true,
      identificador: true,
      alvo: { select: { nome: true, inqueritoid: true } },
    },
  })
  if (!linha || linha.alvo.inqueritoid !== inqueritoId) return null
  return linha
}

/** GET — histórico de "ouvido até" desta linha, do mais recente ao mais antigo. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; linhaId: string }> },
) {
  try {
    const { nuipc: slug, linhaId } = await params
    const ctx = await loadIntercecaoContext(slug)
    if (ctx instanceof Response) return ctx

    const linha = await loadLinha(linhaId, ctx.inquerito.id)
    if (!linha) return apiError('Linha não encontrada', 404)

    const pageRaw = parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10)
    const page = Math.max(1, Number.isFinite(pageRaw) ? pageRaw : 1)

    const [items, total] = await Promise.all([
      prisma.intercecaoOuvidoAte.findMany({
        where: { linhaId: linha.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: OUVIDO_ATE_SELECT,
      }),
      prisma.intercecaoOuvidoAte.count({ where: { linhaId: linha.id } }),
    ])

    return Response.json({
      items,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST — registar até onde a linha foi ouvida. Cada registo é uma entrada nova
 * (não substitui a anterior): o histórico mostra o ritmo de acompanhamento e
 * deixa recuar se alguém se enganou no produto.
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
    const parsed = intercecaoOuvidoAteSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }
    const d = parsed.data

    const data = parseData(d.data)
    if (!data) return apiError('Data inválida', 400)

    const registo = await prisma.intercecaoOuvidoAte.create({
      data: {
        linhaId: linha.id,
        registadoPorId: ctx.userId,
        numeroProduto: d.numeroProduto ?? null,
        data,
        horaInicio: d.horaInicio ?? null,
        horaFim: d.horaFim ?? null,
        observacoes: d.observacoes ?? null,
      },
      select: OUVIDO_ATE_SELECT,
    })

    await writeAudit({
      req,
      acao: 'CREATE_INTERCECAO_OUVIDO_ATE',
      entidade: 'IntercecaoOuvidoAte',
      entidadeId: registo.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        alvoNome: linha.alvo.nome,
        codigo: linha.codigo,
        numeroProduto: registo.numeroProduto,
        data: registo.data.toISOString(),
      },
    })

    return Response.json(registo, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
