import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit, diff } from '@/lib/audit'
import { CONTROLO_SELECT } from '@/lib/controlos'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const updateSchema = z.object({
  descricao: z.string().min(1).max(500).optional(),
  observacoes: z.string().max(2000).optional().nullable(),
  alertaDias: z.number().int().min(1).max(90).optional(),
  concluidoEm: z.string().optional().nullable().refine(
    (val) => !val || !isNaN(Date.parse(val)),
    { message: 'Data de conclusão inválida' },
  ),
})

async function getControloAndCheckAccess(
  id: string,
  role: Role,
  userId: string,
  _brigadaId: string | null,
) {
  const controlo = await prisma.controlo.findUnique({
    where: { id },
    select: { id: true, criadorId: true },
  })
  if (!controlo) return null

  if (controlo.criadorId === userId) return controlo
  if (hasPermission(role, 'controlo:read:all')) return controlo
  return null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { id } = await params

    const controlo = await getControloAndCheckAccess(
      id,
      role,
      session.user.id,
      session.user.brigadaId ?? null,
    )
    if (!controlo) return apiError('Controlo não encontrado', 404)

    const full = await prisma.controlo.findUnique({ where: { id }, select: CONTROLO_SELECT })
    return Response.json(full)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { id } = await params

    const controlo = await getControloAndCheckAccess(
      id,
      role,
      session.user.id,
      session.user.brigadaId ?? null,
    )
    if (!controlo) return apiError('Controlo não encontrado', 404)
    // Only creator or admin can edit
    if (controlo.criadorId !== session.user.id && !hasPermission(role, 'controlo:read:all')) {
      return apiError('Sem permissão para editar este controlo', 403)
    }

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data: Record<string, unknown> = {}
    if (parsed.data.descricao !== undefined) data.descricao = parsed.data.descricao
    if (parsed.data.observacoes !== undefined) data.observacoes = parsed.data.observacoes
    if (parsed.data.alertaDias !== undefined) data.alertaDias = parsed.data.alertaDias
    if (parsed.data.concluidoEm !== undefined) {
      data.concluidoEm = parsed.data.concluidoEm ? new Date(parsed.data.concluidoEm) : null
    }

    // Estado anterior para o diff de auditoria (consulta no histórico do controlo).
    const before = await prisma.controlo.findUnique({
      where: { id },
      select: { descricao: true, observacoes: true, alertaDias: true, concluidoEm: true },
    })

    const updated = await prisma.controlo.update({
      where: { id },
      data,
      select: CONTROLO_SELECT,
    })

    const changes = before
      ? diff(
          {
            descricao: before.descricao,
            observacoes: before.observacoes,
            alertaDias: before.alertaDias,
            concluidoEm: before.concluidoEm,
          },
          {
            descricao: updated.descricao,
            observacoes: updated.observacoes,
            alertaDias: updated.alertaDias,
            concluidoEm: updated.concluidoEm,
          },
          ['descricao', 'observacoes', 'alertaDias', 'concluidoEm'],
        )
      : null

    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_CONTROLO',
        entidade: 'Controlo',
        entidadeId: id,
        utilizadorId: session.user.id,
        detalhes: changes,
      }).catch(() => {})
    }

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

    const controlo = await getControloAndCheckAccess(
      id,
      role,
      session.user.id,
      session.user.brigadaId ?? null,
    )
    if (!controlo) return apiError('Controlo não encontrado', 404)
    if (controlo.criadorId !== session.user.id && !hasPermission(role, 'controlo:read:all')) {
      return apiError('Sem permissão para eliminar este controlo', 403)
    }

    const full = await prisma.controlo.findUnique({
      where: { id },
      select: { descricao: true, inquerito: { select: { nuipc: true } } },
    })
    await prisma.controlo.delete({ where: { id } })
    await writeAudit({
      req,
      acao: 'DELETE_CONTROLO',
      entidade: 'Controlo',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { descricao: full?.descricao ?? null, nuipc: full?.inquerito?.nuipc ?? null },
    }).catch(() => {})
    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
