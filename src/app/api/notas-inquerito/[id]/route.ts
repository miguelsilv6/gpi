import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { notaInqueritoUpdateSchema } from '@/lib/validations/nota-inquerito'
import type { Role } from '@/generated/prisma/enums'

const NOTA_SELECT = {
  id: true,
  titulo: true,
  conteudo: true,
  createdAt: true,
  updatedAt: true,
  autor: { select: { id: true, nome: true } },
  editadoPor: { select: { id: true, nome: true } },
} as const

/** Carrega a nota se o utilizador tiver acesso de leitura ao inquérito pai. */
async function findNotaWithAccess(id: string, role: Role, userId: string, brigadaId: string | null) {
  return prisma.notaInquerito.findFirst({
    where: {
      id,
      inquerito: {
        deletedAt: null,
        ...buildInqueritoWhere(role, userId, brigadaId),
      },
    },
    select: {
      id: true,
      autorId: true,
      titulo: true,
      conteudo: true,
      inquerito: { select: { nuipc: true } },
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { id } = await params

    const nota = await findNotaWithAccess(id, role, session.user.id, session.user.brigadaId ?? null)
    if (!nota) return apiError('Nota não encontrada', 404)

    // Só o autor da nota (ou quem pode editar tudo) a pode editar.
    if (nota.autorId !== session.user.id && !hasPermission(role, 'inquerito:edit:all')) {
      return apiError('Sem permissão para editar esta nota', 403)
    }

    const limited = enforceRateLimit({
      key: `nota:update:${clientFingerprint(req)}:${session.user.id}`,
      max: 60,
      windowMs: 5 * 60_000,
    })
    if (limited) return limited

    const body = await req.json().catch(() => null)
    const parsed = notaInqueritoUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }

    const novoTitulo = parsed.data.titulo ?? null
    const updated = await prisma.notaInquerito.update({
      where: { id },
      data: {
        titulo: novoTitulo,
        conteudo: parsed.data.conteudo,
        editadoPorId: session.user.id,
      },
      select: NOTA_SELECT,
    })

    await writeAudit({
      req,
      acao: 'UPDATE_NOTA_INQUERITO',
      entidade: 'NotaInquerito',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: {
        nuipc: nota.inquerito.nuipc,
        changed: [
          ...(nota.titulo !== novoTitulo ? ['titulo'] : []),
          ...(nota.conteudo !== parsed.data.conteudo ? ['conteudo'] : []),
        ],
      },
    }).catch(() => {})

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { id } = await params

    const nota = await findNotaWithAccess(id, role, session.user.id, session.user.brigadaId ?? null)
    if (!nota) return apiError('Nota não encontrada', 404)

    // Só o autor da nota (ou quem pode editar tudo) a pode eliminar.
    if (nota.autorId !== session.user.id && !hasPermission(role, 'inquerito:edit:all')) {
      return apiError('Sem permissão para eliminar esta nota', 403)
    }

    await prisma.notaInquerito.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_NOTA_INQUERITO',
      entidade: 'NotaInquerito',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { nuipc: nota.inquerito.nuipc },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
