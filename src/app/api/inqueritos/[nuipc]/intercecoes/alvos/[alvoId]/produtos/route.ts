import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadIntercecaoContext, parseData } from '@/lib/intercecoes-api'
import { intercecaoProdutoCreateSchema } from '@/lib/validations/intercecao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

const PRODUTO_SELECT = {
  id: true,
  tipo: true,
  numeroProduto: true,
  direcao: true,
  data: true,
  horaInicio: true,
  horaFim: true,
  de: true,
  para: true,
  resumo: true,
  comentarios: true,
  createdAt: true,
  criadoPor: { select: { id: true, nome: true } },
  linha: { select: { id: true, tipo: true, identificador: true } },
} as const

async function loadAlvo(alvoId: string, inqueritoId: string) {
  const alvo = await prisma.intercecaoAlvo.findUnique({
    where: { id: alvoId },
    select: { id: true, codigo: true, inqueritoid: true },
  })
  if (!alvo || alvo.inqueritoid !== inqueritoId) return null
  return alvo
}

/** GET — produtos de interesse do alvo, paginados (mais recentes primeiro). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; alvoId: string }> },
) {
  try {
    const { nuipc: slug, alvoId } = await params
    const ctx = await loadIntercecaoContext(slug)
    if (ctx instanceof Response) return ctx

    const alvo = await loadAlvo(alvoId, ctx.inquerito.id)
    if (!alvo) return apiError('Alvo não encontrado', 404)

    const pageRaw = parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10)
    const page = Math.max(1, Number.isFinite(pageRaw) ? pageRaw : 1)

    const [items, total] = await Promise.all([
      prisma.intercecaoProduto.findMany({
        where: { alvoId: alvo.id },
        orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: PRODUTO_SELECT,
      }),
      prisma.intercecaoProduto.count({ where: { alvoId: alvo.id } }),
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

/** POST — registar um produto de interesse. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; alvoId: string }> },
) {
  try {
    const { nuipc: slug, alvoId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const alvo = await loadAlvo(alvoId, ctx.inquerito.id)
    if (!alvo) return apiError('Alvo não encontrado', 404)

    const body = await req.json().catch(() => null)
    const parsed = intercecaoProdutoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }
    const d = parsed.data

    const data = parseData(d.data)
    if (!data) return apiError('Data inválida', 400)

    // A linha (opcional) tem de pertencer a ESTE alvo.
    if (d.linhaId) {
      const linha = await prisma.intercecaoLinha.findUnique({
        where: { id: d.linhaId },
        select: { alvoId: true },
      })
      if (!linha || linha.alvoId !== alvo.id) {
        return apiError('A linha indicada não pertence a este alvo', 400)
      }
    }

    const produto = await prisma.intercecaoProduto.create({
      data: {
        alvoId: alvo.id,
        criadoPorId: ctx.userId,
        linhaId: d.linhaId ?? null,
        tipo: d.tipo,
        numeroProduto: d.numeroProduto ?? null,
        direcao: d.direcao ?? null,
        data,
        horaInicio: d.horaInicio ?? null,
        horaFim: d.horaFim ?? null,
        de: d.de ?? null,
        para: d.para ?? null,
        resumo: d.resumo,
        comentarios: d.comentarios ?? null,
      },
      select: PRODUTO_SELECT,
    })

    await writeAudit({
      req,
      acao: 'CREATE_INTERCECAO_PRODUTO',
      entidade: 'IntercecaoProduto',
      entidadeId: produto.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        alvoCodigo: alvo.codigo,
        tipo: produto.tipo,
        resumoPreview: produto.resumo.slice(0, 120),
      },
    })

    return Response.json(produto)
  } catch (error) {
    return handleApiError(error)
  }
}
