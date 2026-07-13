import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadPericiaContext, parsePericiaData, resolveApreensaoLink } from '@/lib/pericias-api'
import { getPericiasForInquerito } from '@/lib/pericias'
import { periciaCreateSchema, ESTADO_PERICIA_TERMINAL } from '@/lib/validations/pericia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadPericiaContext(slug)
    if (ctx instanceof Response) return ctx

    const items = await getPericiasForInquerito(ctx.inquerito.id)
    return Response.json({ items, podeGerir: ctx.canWork })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadPericiaContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const parsed = periciaCreateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    const d = parsed.data

    const dataPedido = parsePericiaData(d.dataPedido)
    if (!dataPedido) return apiError('Data do pedido inválida', 400)

    const apreensaoId = await resolveApreensaoLink(d.apreensaoId, ctx.inquerito.id)
    if (apreensaoId === 'invalid') return apiError('Apreensão associada inválida', 400)

    const estado = d.estado ?? 'SOLICITADA'
    const created = await prisma.pericia.create({
      data: {
        inqueritoid: ctx.inquerito.id,
        registadoPorId: ctx.userId,
        tipo: d.tipo,
        tipoOutro: d.tipo === 'OUTRO' ? (d.tipoOutro ?? null) : null,
        descricao: d.descricao,
        entidade: d.entidade ?? null,
        numeroReferencia: d.numeroReferencia ?? null,
        dataPedido,
        dataPrevista: parsePericiaData(d.dataPrevista),
        estado,
        dataConclusao: ESTADO_PERICIA_TERMINAL.has(estado) ? parsePericiaData(d.dataConclusao) : null,
        resultado: d.resultado ?? null,
        observacoes: d.observacoes ?? null,
        apreensaoId,
      },
      select: { id: true },
    })

    await writeAudit({
      req,
      acao: 'CREATE_PERICIA',
      entidade: 'Pericia',
      entidadeId: created.id,
      utilizadorId: ctx.userId,
      detalhes: { nuipc: ctx.inquerito.nuipc, descricao: d.descricao, tipo: d.tipo },
    }).catch(() => {})

    return Response.json({ id: created.id }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
