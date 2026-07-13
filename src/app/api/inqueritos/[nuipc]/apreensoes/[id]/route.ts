import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit, diff } from '@/lib/audit'
import { loadApreensaoContext, parseApreensaoData } from '@/lib/apreensoes-api'
import { apreensaoUpdateSchema } from '@/lib/validations/apreensao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APREENSAO_SELECT = {
  id: true,
  descricao: true,
  tipo: true,
  tipoOutro: true,
  quantidade: true,
  numeroAuto: true,
  dataApreensao: true,
  local: true,
  apreendidoA: true,
  localCustodia: true,
  estado: true,
  dataDestino: true,
  observacoes: true,
} as const

const AUDIT_KEYS = [
  'descricao',
  'tipo',
  'tipoOutro',
  'quantidade',
  'numeroAuto',
  'dataApreensao',
  'local',
  'apreendidoA',
  'localCustodia',
  'estado',
  'dataDestino',
  'observacoes',
] as const

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; id: string }> },
) {
  try {
    const { nuipc: slug, id } = await params
    const ctx = await loadApreensaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    // Defesa contra IDs cruzados: a apreensão tem de ser deste inquérito.
    const atual = await prisma.apreensao.findFirst({
      where: { id, inqueritoid: ctx.inquerito.id },
      select: APREENSAO_SELECT,
    })
    if (!atual) return apiError('Apreensão não encontrada', 404)

    const parsed = apreensaoUpdateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    const d = parsed.data

    const dataApreensao = parseApreensaoData(d.dataApreensao)
    if (!dataApreensao) return apiError('Data da apreensão inválida', 400)

    const updated = await prisma.apreensao.update({
      where: { id: atual.id },
      data: {
        descricao: d.descricao,
        tipo: d.tipo,
        tipoOutro: d.tipo === 'OUTRO' ? (d.tipoOutro ?? null) : null,
        quantidade: d.quantidade ?? null,
        numeroAuto: d.numeroAuto ?? null,
        dataApreensao,
        local: d.local ?? null,
        apreendidoA: d.apreendidoA ?? null,
        localCustodia: d.localCustodia ?? null,
        estado: d.estado ?? 'EM_CUSTODIA',
        dataDestino: parseApreensaoData(d.dataDestino),
        observacoes: d.observacoes ?? null,
      },
      select: APREENSAO_SELECT,
    })

    const delta = diff(atual, updated, AUDIT_KEYS)
    if (delta) {
      await writeAudit({
        req,
        acao: 'UPDATE_APREENSAO',
        entidade: 'Apreensao',
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
    const ctx = await loadApreensaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const atual = await prisma.apreensao.findFirst({
      where: { id, inqueritoid: ctx.inquerito.id },
      select: { id: true, descricao: true, tipo: true },
    })
    if (!atual) return apiError('Apreensão não encontrada', 404)

    await prisma.apreensao.delete({ where: { id: atual.id } })

    await writeAudit({
      req,
      acao: 'DELETE_APREENSAO',
      entidade: 'Apreensao',
      entidadeId: atual.id,
      utilizadorId: ctx.userId,
      detalhes: { nuipc: ctx.inquerito.nuipc, descricao: atual.descricao, tipo: atual.tipo },
    }).catch(() => {})

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
