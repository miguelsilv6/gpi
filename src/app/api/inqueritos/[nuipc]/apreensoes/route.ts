import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { loadApreensaoContext, parseApreensaoData } from '@/lib/apreensoes-api'
import { getApreensoesForInquerito } from '@/lib/apreensoes'
import { apreensaoCreateSchema } from '@/lib/validations/apreensao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadApreensaoContext(slug)
    if (ctx instanceof Response) return ctx

    const items = await getApreensoesForInquerito(ctx.inquerito.id)
    return Response.json({ items, podeGerir: ctx.canWork })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const { nuipc: slug } = await params
    const ctx = await loadApreensaoContext(slug, { write: true })
    if (ctx instanceof Response) return ctx

    const parsed = apreensaoCreateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    const d = parsed.data

    const dataApreensao = parseApreensaoData(d.dataApreensao)
    if (!dataApreensao) return apiError('Data da apreensão inválida', 400)

    const created = await prisma.apreensao.create({
      data: {
        inqueritoid: ctx.inquerito.id,
        registadoPorId: ctx.userId,
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
      select: { id: true },
    })

    await writeAudit({
      req,
      acao: 'CREATE_APREENSAO',
      entidade: 'Apreensao',
      entidadeId: created.id,
      utilizadorId: ctx.userId,
      detalhes: { nuipc: ctx.inquerito.nuipc, descricao: d.descricao, tipo: d.tipo },
    }).catch(() => {})

    return Response.json({ id: created.id }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
