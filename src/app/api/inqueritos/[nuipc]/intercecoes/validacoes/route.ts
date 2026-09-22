import { NextRequest } from 'next/server'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { loadIntercecaoContext, parseData } from '@/lib/intercecoes-api'
import {
  getPlanoValidacoes,
  sincronizarValidacoes,
  criarPlanoSeNecessario,
} from '@/lib/intercecoes-validacoes'
import { intercecaoPlanoSchema } from '@/lib/validations/intercecao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET — plano de validações do inquérito e respetivas datas (ou null). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadIntercecaoContext(slug)
    if (ctx instanceof Response) return ctx

    return Response.json({ plano: await getPlanoValidacoes(ctx.inquerito.id) })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST — definir (ou redefinir) o plano de validações: data da 1.ª validação,
 * cadência e antecedência do aviso. Regenera de imediato a lista de datas.
 *
 * Mudar a data ou a cadência move as validações futuras e repõe os avisos
 * (`sincronizarValidacoes`); as já marcadas como feitas mantêm-se, porque são
 * o registo do que foi efetivamente apresentado.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const body = await req.json().catch(() => null)
    const parsed = intercecaoPlanoSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }
    const d = parsed.data

    const dataPrimeira = parseData(d.dataPrimeira)
    if (!dataPrimeira) return apiError('Data da 1.ª validação inválida', 400)

    const anterior = await prisma.intercecaoPlanoValidacao.findUnique({
      where: { inqueritoid: ctx.inquerito.id },
      select: { id: true, dataPrimeira: true, intervaloDias: true, alertaDias: true },
    })

    await criarPlanoSeNecessario(ctx.inquerito.id, dataPrimeira)
    await prisma.intercecaoPlanoValidacao.update({
      where: { inqueritoid: ctx.inquerito.id },
      data: {
        dataPrimeira,
        ...(d.intervaloDias !== undefined && { intervaloDias: d.intervaloDias }),
        ...(d.alertaDias !== undefined && { alertaDias: d.alertaDias }),
      },
    })
    await sincronizarValidacoes(ctx.inquerito.id)

    await writeAudit({
      req,
      acao: anterior ? 'UPDATE_INTERCECAO_PLANO' : 'CREATE_INTERCECAO_PLANO',
      entidade: 'IntercecaoPlanoValidacao',
      entidadeId: ctx.inquerito.id,
      utilizadorId: ctx.userId,
      detalhes: {
        nuipc: ctx.inquerito.nuipc,
        dataPrimeira: dataPrimeira.toISOString(),
        intervaloDias: d.intervaloDias ?? anterior?.intervaloDias ?? null,
        alertaDias: d.alertaDias ?? anterior?.alertaDias ?? null,
      },
    })

    return Response.json({ plano: await getPlanoValidacoes(ctx.inquerito.id) })
  } catch (error) {
    return handleApiError(error)
  }
}

/** DELETE — remover o plano (e com ele todas as validações). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadIntercecaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const plano = await prisma.intercecaoPlanoValidacao.findUnique({
      where: { inqueritoid: ctx.inquerito.id },
      select: { id: true, _count: { select: { validacoes: true } } },
    })
    if (!plano) return apiError('Este inquérito não tem plano de validações', 404)

    await prisma.intercecaoPlanoValidacao.delete({ where: { id: plano.id } })

    await writeAudit({
      req,
      acao: 'DELETE_INTERCECAO_PLANO',
      entidade: 'IntercecaoPlanoValidacao',
      entidadeId: plano.id,
      utilizadorId: ctx.userId,
      detalhes: { nuipc: ctx.inquerito.nuipc, validacoes: plano._count.validacoes },
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
