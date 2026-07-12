import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { canTransition } from '@/lib/inquerito-state'
import type { Role } from '@/generated/prisma/enums'

const SELECT = {
  id: true,
  meses: true,
  ativa: true,
  origem: { select: { id: true, codigo: true, nome: true, terminal: true } },
  destino: { select: { id: true, codigo: true, nome: true, terminal: true } },
} as const

const createSchema = z.object({
  origemId: z.string().min(1),
  destinoId: z.string().min(1),
  meses: z.number().int().min(1).max(120),
  ativa: z.boolean().optional(),
})

/** GET — lista as regras (qualquer sessão pode ler). */
export async function GET() {
  try {
    await getSession()
    const regras = await prisma.regraTransicaoAutomatica.findMany({
      orderBy: { createdAt: 'asc' },
      select: SELECT,
    })
    return Response.json(regras)
  } catch (error) {
    return handleApiError(error)
  }
}

/** POST — cria uma regra (só quem gere estados). Uma regra por estado de origem. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:estados:manage')) return apiError('Sem permissão', 403)

    const body = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)
    const { origemId, destinoId, meses, ativa } = parsed.data

    if (origemId === destinoId) return apiError('Origem e destino têm de ser diferentes', 400)

    const [origem, destino] = await Promise.all([
      prisma.estadoInquerito.findUnique({ where: { id: origemId }, select: { id: true, codigo: true, terminal: true, ativo: true } }),
      prisma.estadoInquerito.findUnique({ where: { id: destinoId }, select: { id: true, codigo: true, terminal: true, ativo: true } }),
    ])
    if (!origem || !origem.ativo) return apiError('Estado de origem inválido', 400)
    if (!destino || !destino.ativo) return apiError('Estado de destino inválido', 400)
    if (origem.terminal) return apiError('A origem não pode ser um estado terminal', 400)
    if (!canTransition(origem, { terminal: destino.terminal, ativo: destino.ativo })) {
      return apiError('Transição inválida na máquina de estados', 400)
    }

    const existente = await prisma.regraTransicaoAutomatica.findUnique({ where: { origemId } })
    if (existente) return apiError('Já existe uma regra para este estado de origem', 409)

    const regra = await prisma.regraTransicaoAutomatica.create({
      data: { origemId, destinoId, meses, ativa: ativa ?? true },
      select: SELECT,
    })

    await writeAudit({
      req,
      acao: 'CREATE_REGRA_TRANSICAO',
      entidade: 'RegraTransicaoAutomatica',
      entidadeId: regra.id,
      utilizadorId: session.user.id,
      detalhes: { origem: origem.codigo, destino: destino.codigo, meses },
    })

    return Response.json(regra, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
