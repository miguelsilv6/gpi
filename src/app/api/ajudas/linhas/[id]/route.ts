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
  prevencaoOnly: z.boolean().optional(),
  ajudaCustoAlmoco: z.number().int().min(0).optional(),
  ajudaCustoJantar: z.number().int().min(0).optional(),
  ajudaCustoCeia: z.number().int().min(0).optional(),
  senhaAlmoco: z.number().int().min(0).optional(),
  senhaJantar: z.number().int().min(0).optional(),
  senhaCeia: z.number().int().min(0).optional(),
  viaturaId: z.string().optional().nullable(),
  km: z.number().int().min(0).optional(),
  observacoes: z.string().max(500).optional().nullable(),
})

async function checkLinhaAccess(
  linhaId: string,
  session: { user: { id: string; role: string } },
): Promise<{ linha: { id: string; registoId: string; dataInicio: Date; dataFim: Date; registo: { utilizadorId: string } } } | Response> {
  const linha = await prisma.ajudasLinha.findUnique({
    where: { id: linhaId },
    select: { id: true, registoId: true, dataInicio: true, dataFim: true, registo: { select: { utilizadorId: true } } },
  })
  if (!linha) return apiError('Linha não encontrada', 404)

  const role = session.user.role as Role
  if (linha.registo.utilizadorId !== session.user.id) {
    // Write access requires admin (ajudas:config). Read-only roles
    // (ajudas:read:brigade, ajudas:read:all) must NOT be able to mutate
    // records they do not own — that would be a privilege escalation.
    if (!hasPermission(role, 'ajudas:config')) {
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

    const updateData: Record<string, unknown> = { ...rest }
    if (dataInicio) updateData.dataInicio = new Date(dataInicio)
    if (dataFim) updateData.dataFim = new Date(dataFim)

    // Validate order using the merged effective values (new or existing)
    const { linha } = access as { linha: { id: string; registoId: string; dataInicio: Date; dataFim: Date; registo: { utilizadorId: string } } }
    const effectiveInicio = (updateData.dataInicio as Date | undefined) ?? linha.dataInicio
    const effectiveFim = (updateData.dataFim as Date | undefined) ?? linha.dataFim
    if (effectiveFim <= effectiveInicio) {
      return apiError('A data de fim deve ser posterior à data de início', 400)
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

    // Return updated registo with totals (single query with include)
    const [registo, config] = await Promise.all([
      prisma.ajudasRegisto.findUnique({
        where: { id: updated.registoId },
        include: {
          linhas: { orderBy: { dataInicio: 'asc' }, include: { viatura: { select: { id: true, nome: true, matricula: true } } } },
          utilizador: { select: { ajudasVencimentoBase: true, ajudasTaxaIRS: true } },
        },
      }),
      prisma.ajudasConfig.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} }),
    ])

    const vbPut = registo?.utilizador?.ajudasVencimentoBase
    const irsPut = registo?.utilizador?.ajudasTaxaIRS
    const putConfigured = vbPut != null && irsPut != null

    const totais = putConfigured
      ? calcAjudasTotais(registo!.linhas, config, vbPut!, irsPut!, registo!.ano, registo!.mes)
      : null

    return Response.json({ registo, config, totais, userConfigured: putConfigured })
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

    const { linha } = access as { linha: { id: string; registoId: string; dataInicio: Date; dataFim: Date; registo: { utilizadorId: string } } }
    const registoId = linha.registoId

    await prisma.ajudasLinha.delete({ where: { id } })

    await writeAudit({
      req,
      acao: 'DELETE_AJUDAS_LINHA',
      entidade: 'AjudasLinha',
      entidadeId: id,
      utilizadorId: session.user.id,
    })

    // Return updated registo with totals (single query with include)
    const [registo, config] = await Promise.all([
      prisma.ajudasRegisto.findUnique({
        where: { id: registoId },
        include: {
          linhas: { orderBy: { dataInicio: 'asc' }, include: { viatura: { select: { id: true, nome: true, matricula: true } } } },
          utilizador: { select: { ajudasVencimentoBase: true, ajudasTaxaIRS: true } },
        },
      }),
      prisma.ajudasConfig.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} }),
    ])

    const vbDel = registo?.utilizador?.ajudasVencimentoBase
    const irsDel = registo?.utilizador?.ajudasTaxaIRS
    const delConfigured = vbDel != null && irsDel != null

    const totais = delConfigured
      ? calcAjudasTotais(registo!.linhas, config, vbDel!, irsDel!, registo!.ano, registo!.mes)
      : null

    return Response.json({ registo, config, totais, userConfigured: delConfigured })
  } catch (error) {
    return handleApiError(error)
  }
}
