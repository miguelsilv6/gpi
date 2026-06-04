import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { isModuloFeriasAtivo } from '@/lib/ferias-module'
import { ausenciaUpdateSchema } from '@/lib/validations/ferias'
import { writeAudit } from '@/lib/audit'
import type { Role } from '@/generated/prisma/enums'

/** Parse 'YYYY-MM-DD' into a UTC-midnight Date (timezone-independent). */
function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!))
}

type AusenciaRow = {
  id: string
  inspetorId: string
  tipo: 'FERIAS' | 'FOLGA'
  dataInicio: Date
  dataFim: Date
}

async function checkAusenciaAccess(
  id: string,
  session: { user: { id: string; role: string } },
): Promise<{ ausencia: AusenciaRow } | Response> {
  const ausencia = await prisma.ausencia.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, inspetorId: true, tipo: true, dataInicio: true, dataFim: true },
  })
  if (!ausencia) return apiError('Marcação não encontrada', 404)

  const role = session.user.role as Role
  if (ausencia.inspetorId !== session.user.id) {
    // Read-only scopes (ferias:read:brigade / read:all) must NOT mutate other
    // users' records — only ferias:config (admin) may.
    if (!hasPermission(role, 'ferias:config')) {
      return apiError('Sem permissão para modificar esta marcação', 403)
    }
  }
  return { ausencia }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!(await isModuloFeriasAtivo(role))) return apiError('Módulo Férias está desativado', 503)
    if (!hasPermission(role, 'ferias:own')) return apiError('Sem permissão', 403)

    const { id } = await params
    const access = await checkAusenciaAccess(id, session)
    if (access instanceof Response) return access
    const { ausencia } = access

    const body = await req.json()
    const parsed = ausenciaUpdateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)

    const effectiveTipo = parsed.data.tipo ?? ausencia.tipo
    const effectiveInicio = parsed.data.dataInicio ? parseDateOnly(parsed.data.dataInicio) : ausencia.dataInicio
    const effectiveFim = parsed.data.dataFim ? parseDateOnly(parsed.data.dataFim) : ausencia.dataFim
    if (effectiveFim < effectiveInicio) {
      return apiError('A data de fim não pode ser anterior à data de início', 400)
    }

    // Re-run the overlap guard against OTHER same-tipo ranges of the owner.
    const overlap = await prisma.ausencia.findFirst({
      where: {
        inspetorId: ausencia.inspetorId,
        tipo: effectiveTipo,
        deletedAt: null,
        id: { not: id },
        dataInicio: { lte: effectiveFim },
        dataFim: { gte: effectiveInicio },
      },
      select: { id: true },
    })
    if (overlap) {
      return apiError('Já existe uma marcação do mesmo tipo que se sobrepõe a este período', 409)
    }

    const updateData: Record<string, unknown> = {}
    if (parsed.data.tipo !== undefined) updateData.tipo = parsed.data.tipo
    if (parsed.data.dataInicio !== undefined) updateData.dataInicio = effectiveInicio
    if (parsed.data.dataFim !== undefined) updateData.dataFim = effectiveFim
    if (parsed.data.nota !== undefined) updateData.nota = parsed.data.nota

    const updated = await prisma.ausencia.update({
      where: { id },
      data: updateData,
      select: { id: true, tipo: true, dataInicio: true, dataFim: true, nota: true },
    })

    await writeAudit({
      req,
      acao: 'UPDATE_AUSENCIA',
      entidade: 'Ausencia',
      entidadeId: id,
      utilizadorId: session.user.id,
    })

    return Response.json({ ausencia: updated })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!(await isModuloFeriasAtivo(role))) return apiError('Módulo Férias está desativado', 503)
    if (!hasPermission(role, 'ferias:own')) return apiError('Sem permissão', 403)

    const { id } = await params
    const access = await checkAusenciaAccess(id, session)
    if (access instanceof Response) return access

    // Soft-delete — consistent with the project convention.
    await prisma.ausencia.update({ where: { id }, data: { deletedAt: new Date() } })

    await writeAudit({
      req,
      acao: 'DELETE_AUSENCIA',
      entidade: 'Ausencia',
      entidadeId: id,
      utilizadorId: session.user.id,
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
