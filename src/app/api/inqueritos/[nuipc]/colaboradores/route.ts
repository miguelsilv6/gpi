import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { canManageColaboradores, notifyColaboracaoAutorizada } from '@/lib/colaboradores'
import { writeAudit } from '@/lib/audit'
import { slugToNuipc } from '@/lib/utils'
import { colaboradorCreateSchema } from '@/lib/validations/colaborador'
import { Prisma } from '@/generated/prisma/client'
import type { Role } from '@/generated/prisma/enums'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLABORADOR_SELECT = {
  id: true,
  motivo: true,
  expiraEm: true,
  createdAt: true,
  colaborador: { select: { id: true, nome: true, email: true } },
  concedidoPor: { select: { id: true, nome: true } },
} as const

/** Carrega o inquérito se o utilizador tiver acesso de leitura (scope RBAC). */
async function loadInquerito(nuipc: string, role: Role, userId: string, brigadaId: string | null) {
  return prisma.inquerito.findFirst({
    where: {
      AND: [{ nuipc }, { deletedAt: null }, buildInqueritoWhere(role, userId, brigadaId)],
    },
    select: { id: true, nuipc: true, inspetorId: true, brigadaId: true },
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const brigadaId = session.user.brigadaId ?? null
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)

    const inquerito = await loadInquerito(nuipc, role, session.user.id, brigadaId)
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    const colaboradores = await prisma.inqueritoColaborador.findMany({
      where: { inqueritoid: inquerito.id },
      orderBy: { createdAt: 'desc' },
      select: COLABORADOR_SELECT,
    })

    // Quem consulta a página já tem acesso ao inquérito; expor se pode gerir
    // permite à UI mostrar/ocultar os controlos de conceder/revogar.
    const podeGerir = canManageColaboradores(role, session.user.id, brigadaId, inquerito)
    return Response.json({ items: colaboradores, podeGerir })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const brigadaId = session.user.brigadaId ?? null
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)

    const inquerito = await loadInquerito(nuipc, role, session.user.id, brigadaId)
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    // Só o titular ou a hierarquia autoriza colaboradores. Um colaborador
    // NÃO pode re-delegar (não passa este gate).
    if (!canManageColaboradores(role, session.user.id, brigadaId, inquerito)) {
      return apiError('Sem permissão para autorizar colaboradores neste inquérito', 403)
    }

    const parsed = colaboradorCreateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    const { colaboradorId, motivo, expiraEm: expiraEmRaw } = parsed.data

    // Alvo: inspetor ativo. Não pode ser o próprio titular (redundante) e tem
    // de ser um INSPETOR (o chefe/coordenador já têm acesso pela hierarquia).
    const alvo = await prisma.utilizador.findUnique({
      where: { id: colaboradorId },
      select: { id: true, nome: true, email: true, ativo: true, role: true },
    })
    if (!alvo || !alvo.ativo) return apiError('Inspetor inválido ou inativo', 400)
    if (alvo.role !== 'INSPETOR') {
      return apiError('Só é possível autorizar utilizadores com perfil de Inspetor', 400)
    }
    if (alvo.id === inquerito.inspetorId) {
      return apiError('Este inspetor já é o titular do inquérito', 409)
    }

    // Data de expiração opcional (YYYY-MM-DD → fim do dia). Tem de ser futura.
    let expiraEm: Date | null = null
    if (expiraEmRaw) {
      const base = /^\d{4}-\d{2}-\d{2}$/.test(expiraEmRaw)
        ? new Date(`${expiraEmRaw}T23:59:59.999Z`)
        : new Date(expiraEmRaw)
      if (!Number.isFinite(base.getTime())) return apiError('Data de expiração inválida', 400)
      if (base.getTime() <= Date.now()) return apiError('A data de expiração tem de ser futura', 400)
      expiraEm = base
    }

    let created
    try {
      created = await prisma.inqueritoColaborador.create({
        data: {
          inqueritoid: inquerito.id,
          colaboradorId: alvo.id,
          concedidoPorId: session.user.id,
          motivo: motivo ?? null,
          expiraEm,
        },
        select: COLABORADOR_SELECT,
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return apiError('Este inspetor já está autorizado neste inquérito', 409)
      }
      throw e
    }

    await writeAudit({
      req,
      acao: 'CREATE_INQUERITO_COLABORADOR',
      entidade: 'InqueritoColaborador',
      entidadeId: created.id,
      utilizadorId: session.user.id,
      detalhes: {
        nuipc: inquerito.nuipc,
        colaboradorNome: alvo.nome,
        colaboradorEmail: alvo.email,
        motivo: motivo ?? null,
        expiraEm: expiraEm ? expiraEm.toISOString() : null,
      },
    }).catch(() => {})

    // Notificar o inspetor autorizado — deve saber que passou a ter acesso.
    await notifyColaboracaoAutorizada({
      inqueritoid: inquerito.id,
      nuipc: inquerito.nuipc,
      colaboradorId: alvo.id,
      expiraEm,
      motivo: motivo ?? null,
    })

    return Response.json(created, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
