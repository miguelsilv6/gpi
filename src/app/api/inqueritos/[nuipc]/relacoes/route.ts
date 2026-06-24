import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSession,
  handleApiError,
  apiError,
  buildInqueritoWhere,
  canEditInquerito,
} from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { slugToNuipc } from '@/lib/utils'
import { getRelacoesForInquerito } from '@/lib/relacoes'
import { inqueritoRelacaoCreateSchema } from '@/lib/validations/inquerito-relacao'
import type { Role } from '@/generated/prisma/enums'

/** Carrega o inquérito se o utilizador tiver acesso de leitura (scope RBAC). */
async function findInqueritoWithAccess(nuipc: string, role: Role, userId: string, brigadaId: string | null) {
  return prisma.inquerito.findFirst({
    where: { AND: [{ nuipc }, { deletedAt: null }, buildInqueritoWhere(role, userId, brigadaId)] },
    select: { id: true, nuipc: true, inspetorId: true, brigadaId: true },
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)
    const brigadaId = session.user.brigadaId ?? null

    const inquerito = await findInqueritoWithAccess(nuipc, role, session.user.id, brigadaId)
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    const relacoes = await getRelacoesForInquerito(inquerito.id, role, session.user.id, brigadaId)
    return Response.json({ items: relacoes })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)
    const brigadaId = session.user.brigadaId ?? null

    const inquerito = await findInqueritoWithAccess(nuipc, role, session.user.id, brigadaId)
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    // Criar/eliminar ligações exige permissão de edição do inquérito.
    if (!canEditInquerito(role, session.user.id, brigadaId, inquerito)) {
      return apiError('Sem permissão para ligar inquéritos', 403)
    }

    const body = await req.json().catch(() => null)
    const parsed = inqueritoRelacaoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }
    const { destinoId, tipo, nota } = parsed.data

    if (destinoId === inquerito.id) {
      return apiError('Um inquérito não pode ser ligado a si próprio', 400)
    }

    // O destino tem de existir e estar dentro do âmbito de leitura do utilizador.
    const destino = await prisma.inquerito.findFirst({
      where: {
        AND: [{ id: destinoId }, { deletedAt: null }, buildInqueritoWhere(role, session.user.id, brigadaId)],
      },
      select: { id: true, nuipc: true },
    })
    if (!destino) return apiError('Inquérito de destino inválido ou fora do seu âmbito', 400)

    // Recusa duplicados em QUALQUER sentido (a ligação é simétrica).
    const existing = await prisma.inqueritoRelacao.findFirst({
      where: {
        OR: [
          { origemId: inquerito.id, destinoId: destino.id },
          { origemId: destino.id, destinoId: inquerito.id },
        ],
      },
      select: { id: true },
    })
    if (existing) return apiError('Estes inquéritos já estão ligados', 409)

    // Guarda o par numa ordem canónica (id menor como origem) para que o índice
    // único (origemId, destinoId) cubra AMBOS os sentidos: fecha a race em que
    // dois pedidos simétricos simultâneos (A→B e B→A) passariam ambos a
    // verificação acima e criariam duas linhas para o mesmo par. A direção é
    // irrelevante — a leitura é simétrica e o criador fica em criadoPorId.
    const [menorId, maiorId] = [inquerito.id, destino.id].sort()

    const relacao = await prisma.inqueritoRelacao.create({
      data: {
        origemId: menorId,
        destinoId: maiorId,
        tipo,
        nota: nota ?? null,
        criadoPorId: session.user.id,
      },
      select: { id: true },
    })

    await writeAudit({
      req,
      acao: 'CREATE_INQUERITO_RELACAO',
      entidade: 'InqueritoRelacao',
      entidadeId: relacao.id,
      utilizadorId: session.user.id,
      detalhes: { nuipcOrigem: inquerito.nuipc, nuipcDestino: destino.nuipc, tipo },
    }).catch(() => {})

    return Response.json({ id: relacao.id }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
