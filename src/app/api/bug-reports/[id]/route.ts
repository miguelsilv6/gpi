import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit, diff } from '@/lib/audit'
import { SEVERIDADE_VALUES, ESTADO_VALUES } from '@/lib/bugreport-labels'
import { z } from 'zod'
import type { Role, EstadoBug, SeveridadeBug } from '@/generated/prisma/enums'

const updateSchema = z.object({
  estado: z.enum(ESTADO_VALUES as [string, ...string[]]).optional(),
  severidade: z.enum(SEVERIDADE_VALUES as [string, ...string[]]).optional(),
  notaAdmin: z.string().max(5000).optional().nullable(),
})

/**
 * PATCH — triagem/análise de um bug report pelo ADMINISTRACAO: muda estado,
 * severidade e/ou nota interna. Só `bugreport:manage`.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'bugreport:manage')) {
      return apiError('Sem permissão para gerir bug reports', 403)
    }

    const { id } = await params
    const existing = await prisma.bugReport.findUnique({ where: { id } })
    if (!existing) return apiError('Bug report não encontrado', 404)

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = parsed.data
    const updated = await prisma.bugReport.update({
      where: { id },
      data: {
        ...(data.estado !== undefined && { estado: data.estado as EstadoBug }),
        ...(data.severidade !== undefined && { severidade: data.severidade as SeveridadeBug }),
        ...(data.notaAdmin !== undefined && { notaAdmin: data.notaAdmin?.trim() || null }),
      },
    })

    const changes = diff(existing, updated, ['estado', 'severidade', 'notaAdmin'])
    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_BUG_REPORT',
        entidade: 'BugReport',
        entidadeId: updated.id,
        utilizadorId: session.user.id,
        detalhes: changes as never,
      })
    }

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE — remover definitivamente um bug report (limpeza). Só `bugreport:manage`.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'bugreport:manage')) {
      return apiError('Sem permissão para gerir bug reports', 403)
    }

    const { id } = await params
    const existing = await prisma.bugReport.findUnique({ where: { id } })
    if (!existing) return apiError('Bug report não encontrado', 404)

    await prisma.bugReport.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_BUG_REPORT',
      entidade: 'BugReport',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { titulo: existing.titulo },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
