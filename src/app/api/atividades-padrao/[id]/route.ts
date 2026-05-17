import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit, diff } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  nome: z.string().min(1).max(200).optional(),
  descricao: z.string().max(500).optional().nullable(),
  ativa: z.boolean().optional(),
  ordem: z.coerce.number().int().min(0).optional(),
  temPrazo: z.boolean().optional(),
  temQuantidade: z.boolean().optional(),
  contaParaEstatistica: z.boolean().optional(),
  transicaoEstadoId: z.string().nullable().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) return apiError('Sem permissão', 403)

    const { id } = await params
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const existing = await prisma.atividadePadrao.findUnique({ where: { id } })
    if (!existing) return apiError('Atividade não encontrada', 404)

    // If the caller is setting a new transition target, verify it exists.
    // null/undefined are accepted (clears the rule).
    if (parsed.data.transicaoEstadoId) {
      const estado = await prisma.estadoInquerito.findUnique({
        where: { id: parsed.data.transicaoEstadoId },
        select: { ativo: true },
      })
      if (!estado || !estado.ativo) {
        return apiError('Estado de transição inválido ou inactivo', 400)
      }
    }

    const updated = await prisma.atividadePadrao.update({ where: { id }, data: parsed.data })

    const changes = diff(existing, updated, [
      'nome',
      'descricao',
      'ativa',
      'ordem',
      'temPrazo',
      'temQuantidade',
      'contaParaEstatistica',
      'transicaoEstadoId',
    ])
    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_ATIVIDADE_PADRAO',
        entidade: 'AtividadePadrao',
        entidadeId: id,
        utilizadorId: session.user.id,
        detalhes: changes as never,
      })
    }

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
    if (!hasPermission(role, 'sistema:config')) return apiError('Sem permissão', 403)

    const { id } = await params

    const existing = await prisma.atividadePadrao.findUnique({ where: { id } })
    if (!existing) return apiError('Atividade não encontrada', 404)

    // Atividades from inquéritos reference this by `descricao` (snapshot of `nome`),
    // not by FK — so deletion is technically safe, but it removes the option for
    // future entries. We prefer soft-delete via the `ativa` flag.
    // For consistency: count atividades whose descricao matches the nome.
    const inUse = await prisma.atividade.count({ where: { descricao: existing.nome } })
    if (inUse > 0) {
      return apiError(
        `Atividade padrão em uso em ${inUse} atividade(s). Desative em vez de eliminar.`,
        409,
      )
    }

    await prisma.atividadePadrao.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_ATIVIDADE_PADRAO',
      entidade: 'AtividadePadrao',
      entidadeId: id,
      utilizadorId: session.user.id,
      detalhes: { nome: existing.nome },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
