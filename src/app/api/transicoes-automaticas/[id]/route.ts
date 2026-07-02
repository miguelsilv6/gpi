import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { canTransition } from '@/lib/inquerito-state'
import type { Role } from '@/generated/prisma/enums'

const patchSchema = z.object({
  destinoId: z.string().min(1).optional(),
  meses: z.number().int().min(1).max(120).optional(),
  ativa: z.boolean().optional(),
})

const SELECT = {
  id: true,
  meses: true,
  ativa: true,
  origem: { select: { id: true, codigo: true, nome: true, terminal: true } },
  destino: { select: { id: true, codigo: true, nome: true, terminal: true } },
} as const

/** PATCH — altera destino/meses/ativa de uma regra. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:estados:manage')) return apiError('Sem permissão', 403)

    const { id } = await params
    const regra = await prisma.regraTransicaoAutomatica.findUnique({
      where: { id },
      select: { id: true, origem: { select: { id: true, codigo: true, terminal: true, ativo: true } } },
    })
    if (!regra) return apiError('Regra não encontrada', 404)

    const body = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    if (parsed.data.destinoId) {
      if (parsed.data.destinoId === regra.origem.id) return apiError('Origem e destino têm de ser diferentes', 400)
      const destino = await prisma.estadoInquerito.findUnique({
        where: { id: parsed.data.destinoId },
        select: { id: true, terminal: true, ativo: true },
      })
      if (!destino || !destino.ativo) return apiError('Estado de destino inválido', 400)
      if (!canTransition(regra.origem, { terminal: destino.terminal, ativo: destino.ativo })) {
        return apiError('Transição inválida na máquina de estados', 400)
      }
    }

    const updated = await prisma.regraTransicaoAutomatica.update({
      where: { id },
      data: {
        ...(parsed.data.destinoId !== undefined && { destinoId: parsed.data.destinoId }),
        ...(parsed.data.meses !== undefined && { meses: parsed.data.meses }),
        ...(parsed.data.ativa !== undefined && { ativa: parsed.data.ativa }),
      },
      select: SELECT,
    })

    await writeAudit({
      req,
      acao: 'UPDATE_REGRA_TRANSICAO',
      entidade: 'RegraTransicaoAutomatica',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { changed: parsed.data } as never,
    })

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

/** DELETE — remove uma regra. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:estados:manage')) return apiError('Sem permissão', 403)

    const { id } = await params
    const regra = await prisma.regraTransicaoAutomatica.findUnique({
      where: { id },
      select: { origem: { select: { codigo: true } }, destino: { select: { codigo: true } } },
    })
    if (!regra) return apiError('Regra não encontrada', 404)

    await prisma.regraTransicaoAutomatica.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_REGRA_TRANSICAO',
      entidade: 'RegraTransicaoAutomatica',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { origem: regra.origem.codigo, destino: regra.destino.codigo } as never,
    })

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
