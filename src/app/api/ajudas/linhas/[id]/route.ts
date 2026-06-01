import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { calcAjudasTotais } from '@/lib/ajudas-calc'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const updateSchema = z.object({
  nuipc: z.string().max(50).optional().nullable(),
  local: z.string().max(200).optional().nullable(),
  dataInicio: z.string().datetime().optional(),
  dataFim: z.string().datetime().optional(),
  prevencao: z.enum(['NENHUMA', 'PIQUETE', 'PREVENCAO_PASSIVA']).optional(),
  ajudaCustoAlmoco: z.number().int().min(0).optional(),
  ajudaCustoJantar: z.number().int().min(0).optional(),
  ajudaCustoAlojamento: z.number().int().min(0).optional(),
  senhaAlmoco: z.number().int().min(0).optional(),
  senhaJantar: z.number().int().min(0).optional(),
  senhaCeia: z.number().int().min(0).optional(),
  viatura: z.enum(['PROPRIA', 'BRIGADA']).optional().nullable(),
  km: z.number().int().min(0).optional(),
  observacoes: z.string().max(500).optional().nullable(),
})

async function checkLinhaAccess(
  linhaId: string,
  session: { user: { id: string; role: string } },
): Promise<{ linha: { id: string; registoId: string; registo: { utilizadorId: string } } } | Response> {
  const linha = await prisma.ajudasLinha.findUnique({
    where: { id: linhaId },
    include: { registo: { select: { utilizadorId: true } } },
  })
  if (!linha) return apiError('Linha não encontrada', 404)

  const role = session.user.role as Role
  if (linha.registo.utilizadorId !== session.user.id) {
    const canAll = hasPermission(role, 'ajudas:read:all')
    const canBrigade = hasPermission(role, 'ajudas:read:brigade')
    if (!canAll && !canBrigade) {
      return apiError('Sem permissão para modificar esta linha', 403)
    }
  }

  return { linha }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'ajudas:own')) return apiError('Sem permissão', 403)

    const { id } = await params
    const access = await checkLinhaAccess(id, session)
    if (access instanceof Response) return access

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)

    const { dataInicio, dataFim, ...rest } = parsed.data

    // Validate dates if both provided
    const updateData: Record<string, unknown> = { ...rest }
    if (dataInicio) updateData.dataInicio = new Date(dataInicio)
    if (dataFim) updateData.dataFim = new Date(dataFim)

    if (updateData.dataInicio && updateData.dataFim) {
      if ((updateData.dataFim as Date) <= (updateData.dataInicio as Date)) {
        return apiError('A data de fim deve ser posterior à data de início', 400)
      }
    }

    const updated = await prisma.ajudasLinha.update({
      where: { id },
      data: updateData,
    })

    await writeAudit({
      req,
      acao: 'UPDATE_AJUDAS_LINHA',
      entidade: 'AjudasLinha',
      entidadeId: id,
      utilizadorId: session.user.id,
    })

    // Return updated registo with totals
    const registo = await prisma.ajudasRegisto.findUnique({
      where: { id: updated.registoId },
      include: { linhas: { orderBy: { dataInicio: 'asc' } } },
    })

    const config = await prisma.ajudasConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    })

    const totais = calcAjudasTotais(registo!.linhas, config)

    return Response.json({ registo, config, totais })
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
    if (!hasPermission(role, 'ajudas:own')) return apiError('Sem permissão', 403)

    const { id } = await params
    const access = await checkLinhaAccess(id, session)
    if (access instanceof Response) return access

    const { linha } = access as { linha: { id: string; registoId: string; registo: { utilizadorId: string } } }
    const registoId = linha.registoId

    await prisma.ajudasLinha.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_AJUDAS_LINHA',
      entidade: 'AjudasLinha',
      entidadeId: id,
      utilizadorId: session.user.id,
    })

    // Return updated registo with totals
    const registo = await prisma.ajudasRegisto.findUnique({
      where: { id: registoId },
      include: { linhas: { orderBy: { dataInicio: 'asc' } } },
    })

    const config = await prisma.ajudasConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    })

    const totais = calcAjudasTotais(registo!.linhas, config)

    return Response.json({ registo, config, totais })
  } catch (error) {
    return handleApiError(error)
  }
}
