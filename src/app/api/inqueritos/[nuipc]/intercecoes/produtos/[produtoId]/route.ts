import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit, diff } from '@/lib/audit'
import { loadIntercecaoContext, parseData } from '@/lib/intercecoes-api'
import { intercecaoProdutoUpdateSchema } from '@/lib/validations/intercecao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function loadProduto(produtoId: string, inqueritoId: string) {
  const produto = await prisma.intercecaoProduto.findUnique({
    where: { id: produtoId },
    include: { alvo: { select: { id: true, nome: true, inqueritoid: true } } },
  })
  if (!produto || produto.alvo.inqueritoid !== inqueritoId) return null
  return produto
}

/** PUT — atualizar um produto de interesse. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; produtoId: string }> },
) {
  try {
    const { nuipc: slug, produtoId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const produto = await loadProduto(produtoId, ctx.inquerito.id)
    if (!produto) return apiError('Produto não encontrado', 404)

    const body = await req.json().catch(() => null)
    const parsed = intercecaoProdutoUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }
    const d = parsed.data

    let data: Date | undefined
    if (d.data !== undefined) {
      const v = parseData(d.data)
      if (!v) return apiError('Data inválida', 400)
      data = v
    }

    // linhaId: '' limpa a associação; não-vazio tem de pertencer ao MESMO alvo.
    let linhaId: string | null | undefined
    if (d.linhaId !== undefined) {
      if (d.linhaId === '') {
        linhaId = null
      } else {
        const linha = await prisma.intercecaoLinha.findUnique({
          where: { id: d.linhaId },
          select: { alvoId: true },
        })
        if (!linha || linha.alvoId !== produto.alvo.id) {
          return apiError('A linha indicada não pertence a este alvo', 400)
        }
        linhaId = d.linhaId
      }
    }

    const updated = await prisma.intercecaoProduto.update({
      where: { id: produto.id },
      data: {
        ...(d.tipo !== undefined && { tipo: d.tipo }),
        ...(linhaId !== undefined && { linhaId }),
        ...(d.numeroProduto !== undefined && { numeroProduto: d.numeroProduto.trim() || null }),
        ...(d.direcao !== undefined && { direcao: d.direcao === '' ? null : d.direcao }),
        ...(data !== undefined && { data }),
        ...(d.horaInicio !== undefined && { horaInicio: d.horaInicio || null }),
        ...(d.horaFim !== undefined && { horaFim: d.horaFim || null }),
        ...(d.duracao !== undefined && { duracao: d.duracao || null }),
        ...(d.paraTranscricao !== undefined && { paraTranscricao: d.paraTranscricao }),
        ...(d.de !== undefined && { de: d.de.trim() || null }),
        ...(d.para !== undefined && { para: d.para.trim() || null }),
        ...(d.resumo !== undefined && { resumo: d.resumo }),
        ...(d.comentarios !== undefined && { comentarios: d.comentarios.trim() || null }),
      },
    })

    const keys = ['tipo', 'numeroProduto', 'direcao', 'data', 'horaInicio', 'horaFim', 'duracao', 'paraTranscricao', 'de', 'para', 'resumo', 'comentarios', 'linhaId'] as const
    const changes = diff(
      Object.fromEntries(keys.map((k) => [k, produto[k]])) as Record<string, string | Date | boolean | null>,
      Object.fromEntries(keys.map((k) => [k, updated[k]])) as Record<string, string | Date | boolean | null>,
      keys,
    )
    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_INTERCECAO_PRODUTO',
        entidade: 'IntercecaoProduto',
        entidadeId: produto.id,
        utilizadorId: ctx.userId,
        detalhes: { nuipc: ctx.inquerito.nuipc, alvoNome: produto.alvo.nome, ...changes } as never,
      })
    }

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

/** DELETE — eliminar um produto de interesse. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; produtoId: string }> },
) {
  try {
    const { nuipc: slug, produtoId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const produto = await loadProduto(produtoId, ctx.inquerito.id)
    if (!produto) return apiError('Produto não encontrado', 404)

    await prisma.intercecaoProduto.delete({ where: { id: produto.id } })

    await writeAudit({
      req,
      acao: 'DELETE_INTERCECAO_PRODUTO',
      entidade: 'IntercecaoProduto',
      entidadeId: produto.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        alvoNome: produto.alvo.nome,
        tipo: produto.tipo,
        resumoPreview: produto.resumo.slice(0, 120),
      },
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
