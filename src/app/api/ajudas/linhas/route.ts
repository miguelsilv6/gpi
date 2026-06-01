import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { calcAjudasTotais } from '@/lib/ajudas-calc'
import { writeAudit } from '@/lib/audit'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'

const linhaSchema = z.object({
  registoId: z.string().min(1),
  nuipc: z.string().max(50).optional().nullable(),
  local: z.string().max(200).optional().nullable(),
  dataInicio: z.string().datetime(),
  dataFim: z.string().datetime(),
  prevencao: z.enum(['NENHUMA', 'PIQUETE', 'PREVENCAO_PASSIVA']).default('NENHUMA'),
  prevencaoOnly: z.boolean().default(false),
  ajudaCustoAlmoco: z.number().int().min(0).default(0),
  ajudaCustoJantar: z.number().int().min(0).default(0),
  ajudaCustoAlojamento: z.number().int().min(0).default(0),
  senhaAlmoco: z.number().int().min(0).default(0),
  senhaJantar: z.number().int().min(0).default(0),
  senhaCeia: z.number().int().min(0).default(0),
  viaturaId: z.string().optional().nullable(),
  km: z.number().int().min(0).default(0),
  observacoes: z.string().max(500).optional().nullable(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!hasPermission(role, 'ajudas:own')) return apiError('Sem permissão', 403)

    const body = await req.json()
    const parsed = linhaSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)

    const { registoId, dataInicio, dataFim, ...rest } = parsed.data

    // Validate dates
    const inicio = new Date(dataInicio)
    const fim = new Date(dataFim)
    if (fim <= inicio) {
      return apiError('A data de fim deve ser posterior à data de início', 400)
    }
    const durationDays = (fim.getTime() - inicio.getTime()) / 86_400_000
    if (durationDays > 31) {
      return apiError('O intervalo máximo para horas extra é de 31 dias', 400)
    }

    // Verify the registo belongs to the caller or caller has elevated permissions
    const registo = await prisma.ajudasRegisto.findUnique({
      where: { id: registoId },
      select: { utilizadorId: true },
    })

    if (!registo) return apiError('Registo não encontrado', 404)

    if (registo.utilizadorId !== session.user.id) {
      // Write access requires admin. Read-only scopes (brigade/all) must not
      // allow creating lines in other users' registos.
      if (!hasPermission(role, 'ajudas:config')) {
        return apiError('Sem permissão para modificar este registo', 403)
      }
    }

    // Create the line
    const linha = await prisma.ajudasLinha.create({
      data: {
        registoId,
        dataInicio: inicio,
        dataFim: fim,
        ...rest,
      },
    })

    await writeAudit({
      req,
      acao: 'CREATE_AJUDAS_LINHA',
      entidade: 'AjudasLinha',
      entidadeId: linha.id,
      utilizadorId: session.user.id,
      detalhes: { registoId } as never,
    })

    // Return updated registo with totals (single query with include)
    const [updatedRegisto, config] = await Promise.all([
      prisma.ajudasRegisto.findUnique({
        where: { id: registoId },
        include: {
          linhas: {
            orderBy: { dataInicio: 'asc' },
            include: { viatura: { select: { id: true, nome: true, matricula: true } } },
          },
          utilizador: { select: { ajudasVencimentoBase: true, ajudasTaxaIRS: true } },
        },
      }),
      prisma.ajudasConfig.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} }),
    ])

    const vencimentoBase = updatedRegisto?.utilizador?.ajudasVencimentoBase
    const taxaIRS = updatedRegisto?.utilizador?.ajudasTaxaIRS
    const userConfigured = vencimentoBase != null && taxaIRS != null

    const totais = userConfigured
      ? calcAjudasTotais(updatedRegisto!.linhas, config, vencimentoBase!, taxaIRS!)
      : null

    return Response.json({ registo: updatedRegisto, config, totais, userConfigured }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
