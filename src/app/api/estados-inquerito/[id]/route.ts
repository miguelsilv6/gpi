import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit, diff } from '@/lib/audit'
import {
  ESTADO_COR_OPTIONS,
  PROTECTED_ESTADO_CODIGOS,
  REOPEN_ESTADO_CODIGO,
} from '@/lib/constants'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const updateSchema = z.object({
  // codigo is immutable — code depends on stable codigos.
  nome: z.string().min(1).max(60).optional(),
  descricao: z.string().max(300).optional().nullable(),
  ordem: z.number().int().min(0).max(999).optional(),
  terminal: z.boolean().optional(),
  cor: z.enum(ESTADO_COR_OPTIONS as [string, ...string[]]).optional().nullable(),
  ativo: z.boolean().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:estados:manage')) {
      return apiError('Sem permissão para gerir estados', 403)
    }

    const { id } = await params
    const existing = await prisma.estadoInquerito.findUnique({ where: { id } })
    if (!existing) return apiError('Estado não encontrado', 404)

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = parsed.data

    // Cannot change `terminal` on a protected codigo — it has semantic meaning
    // for the state machine and reopening logic.
    if (
      data.terminal !== undefined &&
      data.terminal !== existing.terminal &&
      PROTECTED_ESTADO_CODIGOS.has(existing.codigo)
    ) {
      return apiError(
        'Não é possível alterar a flag terminal num estado protegido pelo sistema',
        409,
      )
    }

    // The estado used for reabertura is critical — desactivar este código
    // partiria a /api/inqueritos/[nuipc]/reopen. Bloquear sempre,
    // independentemente de haver ou não inquéritos a usá-lo neste momento.
    if (data.ativo === false && existing.codigo === REOPEN_ESTADO_CODIGO) {
      return apiError(
        'Este estado é usado pela reabertura de inquéritos — não pode ser desactivado.',
        409,
      )
    }

    // Cannot deactivate a protected codigo if there are inquéritos using it
    if (
      data.ativo === false &&
      existing.ativo &&
      PROTECTED_ESTADO_CODIGOS.has(existing.codigo)
    ) {
      const count = await prisma.inquerito.count({ where: { estadoId: id, deletedAt: null } })
      if (count > 0) {
        return apiError(
          `Estado protegido em uso (${count} inquéritos). Não pode ser desativado.`,
          409,
        )
      }
    }

    const updated = await prisma.estadoInquerito.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.descricao !== undefined && { descricao: data.descricao }),
        ...(data.ordem !== undefined && { ordem: data.ordem }),
        ...(data.terminal !== undefined && { terminal: data.terminal }),
        ...(data.cor !== undefined && { cor: data.cor }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
    })

    const changes = diff(existing, updated, [
      'nome',
      'descricao',
      'ordem',
      'terminal',
      'cor',
      'ativo',
    ])

    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_ESTADO_INQUERITO',
        entidade: 'EstadoInquerito',
        entidadeId: updated.id,
        utilizadorId: session.user.id,
        detalhes: { codigo: existing.codigo, ...changes },
      })
    }

    revalidatePath('/inqueritos')
    revalidatePath('/configuracoes')

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:estados:manage')) {
      return apiError('Sem permissão para gerir estados', 403)
    }

    const { id } = await params
    const existing = await prisma.estadoInquerito.findUnique({ where: { id } })
    if (!existing) return apiError('Estado não encontrado', 404)

    // Protected codigos can only be deactivated, not deleted
    if (PROTECTED_ESTADO_CODIGOS.has(existing.codigo)) {
      return apiError(
        'Estados protegidos pelo sistema só podem ser desativados, não eliminados',
        409,
      )
    }

    // Can't delete a state that's in use
    const inUse = await prisma.inquerito.count({ where: { estadoId: id } })
    if (inUse > 0) {
      return apiError(
        `Estado em uso em ${inUse} inquérito(s). Desative em vez de eliminar.`,
        409,
      )
    }

    await prisma.estadoInquerito.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_ESTADO_INQUERITO',
      entidade: 'EstadoInquerito',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { codigo: existing.codigo, nome: existing.nome },
    })

    revalidatePath('/inqueritos')
    revalidatePath('/configuracoes')

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
