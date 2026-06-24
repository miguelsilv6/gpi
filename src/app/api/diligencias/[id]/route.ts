import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { isModuloAgendaAtivo } from '@/lib/agenda-module'
import { diligenciaUpdateSchema } from '@/lib/validations/diligencia'
import type { Role } from '@/generated/prisma/enums'
import type { Prisma } from '@/generated/prisma/client'

function parseDate(s: string): Date | null {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Só o criador (ou um admin com edit:all) pode alterar/eliminar a diligência. */
async function loadManageable(id: string, role: Role, userId: string) {
  const diligencia = await prisma.diligencia.findUnique({
    where: { id },
    select: { id: true, criadoPorId: true, titulo: true, dataInicio: true },
  })
  if (!diligencia) return { error: apiError('Diligência não encontrada', 404) }
  const canManage = diligencia.criadoPorId === userId || hasPermission(role, 'inquerito:edit:all')
  if (!canManage) return { error: apiError('Sem permissão para alterar esta diligência', 403) }
  return { diligencia }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloAgendaAtivo(role))) return apiError('Módulo Agenda desativado', 503)
    const { id } = await params

    const { diligencia, error } = await loadManageable(id, role, session.user.id)
    if (error) return error

    const body = await req.json().catch(() => null)
    const parsed = diligenciaUpdateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    const data = parsed.data

    const update: Prisma.DiligenciaUpdateInput = {}
    if (data.titulo !== undefined) update.titulo = data.titulo
    if (data.tipo !== undefined) update.tipo = data.tipo
    if (data.local !== undefined) update.local = data.local ?? null
    if (data.observacoes !== undefined) update.observacoes = data.observacoes ?? null
    if (data.concluida !== undefined) update.concluida = data.concluida

    let novaDataInicio = diligencia!.dataInicio
    if (data.dataInicio !== undefined) {
      const d = parseDate(data.dataInicio)
      if (!d) return apiError('Data de início inválida', 400)
      update.dataInicio = d
      novaDataInicio = d
    }
    if (data.dataFim !== undefined) {
      if (!data.dataFim) {
        update.dataFim = null
      } else {
        const d = parseDate(data.dataFim)
        if (!d) return apiError('Data de fim inválida', 400)
        if (d < novaDataInicio) return apiError('A data de fim não pode ser anterior à de início', 400)
        update.dataFim = d
      }
    }

    if (data.inqueritoId !== undefined) {
      if (!data.inqueritoId) {
        update.inquerito = { disconnect: true }
      } else {
        const inq = await prisma.inquerito.findFirst({
          where: {
            AND: [
              { id: data.inqueritoId },
              { deletedAt: null },
              buildInqueritoWhere(role, session.user.id, session.user.brigadaId ?? null),
            ],
          },
          select: { id: true },
        })
        if (!inq) return apiError('Inquérito inválido ou fora do seu âmbito', 400)
        update.inquerito = { connect: { id: inq.id } }
      }
    }

    await prisma.diligencia.update({ where: { id }, data: update })

    await writeAudit({
      req,
      acao: 'UPDATE_DILIGENCIA',
      entidade: 'Diligencia',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { campos: Object.keys(update) },
    }).catch(() => {})

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloAgendaAtivo(role))) return apiError('Módulo Agenda desativado', 503)
    const { id } = await params

    const { diligencia, error } = await loadManageable(id, role, session.user.id)
    if (error) return error

    await prisma.diligencia.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_DILIGENCIA',
      entidade: 'Diligencia',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { titulo: diligencia!.titulo },
    }).catch(() => {})

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
