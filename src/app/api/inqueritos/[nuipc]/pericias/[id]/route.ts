import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit, diff } from '@/lib/audit'
import { loadPericiaContext, parsePericiaData, resolveApreensaoLink } from '@/lib/pericias-api'
import { periciaUpdateSchema, ESTADO_PERICIA_TERMINAL } from '@/lib/validations/pericia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PERICIA_SELECT = {
  id: true,
  tipo: true,
  tipoOutro: true,
  descricao: true,
  entidade: true,
  numeroReferencia: true,
  dataPedido: true,
  dataPrevista: true,
  estado: true,
  dataConclusao: true,
  resultado: true,
  observacoes: true,
  apreensaoId: true,
} as const

const AUDIT_KEYS = [
  'tipo',
  'tipoOutro',
  'descricao',
  'entidade',
  'numeroReferencia',
  'dataPedido',
  'dataPrevista',
  'estado',
  'dataConclusao',
  'resultado',
  'observacoes',
  'apreensaoId',
] as const

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; id: string }> },
) {
  try {
    const { nuipc: slug, id } = await params
    const ctx = await loadPericiaContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    // Defesa contra IDs cruzados: a perícia tem de ser deste inquérito.
    const atual = await prisma.pericia.findFirst({
      where: { id, inqueritoid: ctx.inquerito.id },
      select: PERICIA_SELECT,
    })
    if (!atual) return apiError('Perícia não encontrada', 404)

    const parsed = periciaUpdateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    const d = parsed.data

    const dataPedido = parsePericiaData(d.dataPedido)
    if (!dataPedido) return apiError('Data do pedido inválida', 400)

    const apreensaoId = await resolveApreensaoLink(d.apreensaoId, ctx.inquerito.id)
    if (apreensaoId === 'invalid') return apiError('Apreensão associada inválida', 400)

    const estado = d.estado ?? 'SOLICITADA'
    const updated = await prisma.pericia.update({
      where: { id: atual.id },
      data: {
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
      select: PERICIA_SELECT,
    })

    const delta = diff(atual, updated, AUDIT_KEYS)
    if (delta) {
      await writeAudit({
        req,
        acao: 'UPDATE_PERICIA',
        entidade: 'Pericia',
        entidadeId: updated.id,
        utilizadorId: ctx.userId,
        detalhes: { nuipc: ctx.inquerito.nuipc, descricao: updated.descricao, ...delta },
      }).catch(() => {})
    }

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; id: string }> },
) {
  try {
    const { nuipc: slug, id } = await params
    const ctx = await loadPericiaContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const atual = await prisma.pericia.findFirst({
      where: { id, inqueritoid: ctx.inquerito.id },
      select: { id: true, descricao: true, tipo: true },
    })
    if (!atual) return apiError('Perícia não encontrada', 404)

    await prisma.pericia.delete({ where: { id: atual.id } })

    await writeAudit({
      req,
      acao: 'DELETE_PERICIA',
      entidade: 'Pericia',
      entidadeId: atual.id,
      utilizadorId: ctx.userId,
      detalhes: { nuipc: ctx.inquerito.nuipc, descricao: atual.descricao, tipo: atual.tipo },
    }).catch(() => {})

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
