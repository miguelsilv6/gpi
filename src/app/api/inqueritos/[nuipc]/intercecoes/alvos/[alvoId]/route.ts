import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit, diff } from '@/lib/audit'
import { loadIntercecaoContext } from '@/lib/intercecoes-api'
import { intercecaoAlvoUpdateSchema } from '@/lib/validations/intercecao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** PUT — atualizar um alvo (nome, código, observações). */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; alvoId: string }> },
) {
  try {
    const { nuipc: slug, alvoId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const alvo = await prisma.intercecaoAlvo.findUnique({ where: { id: alvoId } })
    // Cadeia de posse: o alvo tem de pertencer a ESTE inquérito.
    if (!alvo || alvo.inqueritoid !== ctx.inquerito.id) {
      return apiError('Alvo não encontrado', 404)
    }

    const body = await req.json().catch(() => null)
    const parsed = intercecaoAlvoUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }
    const d = parsed.data

    if (d.codigo !== undefined && d.codigo !== alvo.codigo) {
      const duplicado = await prisma.intercecaoAlvo.findFirst({
        where: { inqueritoid: ctx.inquerito.id, codigo: d.codigo, id: { not: alvo.id } },
        select: { id: true },
      })
      if (duplicado) {
        return apiError('Já existe um alvo com este código neste inquérito', 409)
      }
    }

    const updated = await prisma.intercecaoAlvo.update({
      where: { id: alvo.id },
      data: {
        ...(d.nome !== undefined && { nome: d.nome }),
        ...(d.codigo !== undefined && { codigo: d.codigo }),
        // '' limpa o campo; omitido mantém.
        ...(d.observacoes !== undefined && { observacoes: d.observacoes.trim() || null }),
      },
    })

    const changes = diff(
      { nome: alvo.nome, codigo: alvo.codigo, observacoes: alvo.observacoes },
      { nome: updated.nome, codigo: updated.codigo, observacoes: updated.observacoes },
      ['nome', 'codigo', 'observacoes'],
    )
    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_INTERCECAO_ALVO',
        entidade: 'IntercecaoAlvo',
        entidadeId: alvo.id,
        utilizadorId: ctx.userId,
        detalhes: { nuipc: ctx.inquerito.nuipc, ...changes } as never,
      })
    }

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

/** DELETE — eliminar um alvo (cascade: linhas e produtos). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; alvoId: string }> },
) {
  try {
    const { nuipc: slug, alvoId } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const alvo = await prisma.intercecaoAlvo.findUnique({
      where: { id: alvoId },
      include: { _count: { select: { linhas: true, produtos: true } } },
    })
    if (!alvo || alvo.inqueritoid !== ctx.inquerito.id) {
      return apiError('Alvo não encontrado', 404)
    }

    await prisma.intercecaoAlvo.delete({ where: { id: alvo.id } })

    await writeAudit({
      req,
      acao: 'DELETE_INTERCECAO_ALVO',
      entidade: 'IntercecaoAlvo',
      entidadeId: alvo.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        nome: alvo.nome,
        codigo: alvo.codigo,
        linhas: alvo._count.linhas,
        produtos: alvo._count.produtos,
      },
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
