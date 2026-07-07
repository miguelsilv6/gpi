import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { canWorkOnInquerito } from '@/lib/colaboradores'
import { writeAudit } from '@/lib/audit'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { slugToNuipc } from '@/lib/utils'
import { notaInqueritoCreateSchema } from '@/lib/validations/nota-inquerito'
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

/** Carrega o inquérito se o utilizador tiver acesso de leitura (scope RBAC). */
async function findInqueritoWithAccess(nuipc: string, role: Role, userId: string, brigadaId: string | null) {
  return prisma.inquerito.findFirst({
    where: {
      AND: [
        { nuipc },
        { deletedAt: null },
        buildInqueritoWhere(role, userId, brigadaId),
      ],
    },
    select: { id: true, nuipc: true, inspetorId: true, brigadaId: true },
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)

    const inquerito = await findInqueritoWithAccess(nuipc, role, session.user.id, session.user.brigadaId ?? null)
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    const notas = await prisma.notaInquerito.findMany({
      where: { inqueritoId: inquerito.id },
      orderBy: { createdAt: 'desc' },
      select: NOTA_SELECT,
    })
    return Response.json({ items: notas })
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

    const inquerito = await findInqueritoWithAccess(nuipc, role, session.user.id, session.user.brigadaId ?? null)
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    // Mesma regra de quem pode adicionar atividades/documentos (inclui o
    // fallback de colaborador autorizado): ESTATISTICA nunca; INSPETOR nos
    // seus (ou onde é colaborador); CHEFE na sua brigada; superior em todos.
    const canAdd = await canWorkOnInquerito(
      role, session.user.id, session.user.brigadaId ?? null, inquerito,
    )
    if (!canAdd) return apiError('Sem permissão para adicionar notas neste inquérito', 403)

    const limited = enforceRateLimit({
      key: `nota:create:${clientFingerprint(req)}:${session.user.id}`,
      max: 30,
      windowMs: 5 * 60_000,
    })
    if (limited) return limited

    const body = await req.json().catch(() => null)
    const parsed = notaInqueritoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    }

    const nota = await prisma.notaInquerito.create({
      data: {
        titulo: parsed.data.titulo ?? null,
        conteudo: parsed.data.conteudo,
        inqueritoId: inquerito.id,
        autorId: session.user.id,
      },
      select: NOTA_SELECT,
    })

    await writeAudit({
      req,
      acao: 'CREATE_NOTA_INQUERITO',
      entidade: 'NotaInquerito',
      entidadeId: nota.id,
      utilizadorId: session.user.id,
      detalhes: { nuipc: inquerito.nuipc, conteudoPreview: parsed.data.conteudo.slice(0, 120) },
    }).catch(() => {})

    return Response.json(nota, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
