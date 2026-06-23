import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const schema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(200),
  descricao: z.string().max(500).optional().nullable(),
  ordem: z.coerce.number().int().min(0).optional(),
  temPrazo: z.boolean().optional(),
  temQuantidade: z.boolean().optional(),
  temControlo: z.boolean().optional(),
  contaParaEstatistica: z.boolean().optional(),
  transicaoEstadoId: z.string().min(1).nullable().optional(),
  transicaoEstadoConclusaoId: z.string().min(1).nullable().optional(),
  categoriaDashboard: z.enum(['AGUARDA_EXAMES', 'ENVIADO']).nullable().optional(),
})

export async function GET() {
  try {
    await getSession()
    const atividades = await prisma.atividadePadrao.findMany({
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
    return Response.json(atividades)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) return apiError('Sem permissão', 403)

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const exists = await prisma.atividadePadrao.findUnique({ where: { nome: parsed.data.nome } })
    if (exists) return apiError('Já existe uma atividade padrão com este nome', 409)

    // If transition targets were given, verify they exist and are active.
    for (const estadoId of [parsed.data.transicaoEstadoId, parsed.data.transicaoEstadoConclusaoId]) {
      if (!estadoId) continue
      const estado = await prisma.estadoInquerito.findUnique({
        where: { id: estadoId },
        select: { ativo: true },
      })
      if (!estado || !estado.ativo) {
        return apiError('Estado de transição inválido ou inactivo', 400)
      }
    }

    const atividade = await prisma.atividadePadrao.create({ data: parsed.data })

    await writeAudit({
      req,
      acao: 'CREATE_ATIVIDADE_PADRAO',
      entidade: 'AtividadePadrao',
      entidadeId: atividade.id,
      utilizadorId: session.user.id,
      detalhes: parsed.data as never,
    })

    return Response.json(atividade, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
