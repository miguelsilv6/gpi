import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { calcAjudasTotais } from '@/lib/ajudas-calc'
import type { Role } from '@/generated/prisma/enums'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!hasPermission(role, 'ajudas:own')) return apiError('Sem permissão', 403)

    const { searchParams } = new URL(req.url)
    const anoParam = searchParams.get('ano')
    const mesParam = searchParams.get('mes')
    const utilizadorIdParam = searchParams.get('utilizadorId')

    const now = new Date()
    const ano = anoParam ? parseInt(anoParam, 10) : now.getFullYear()
    const mes = mesParam ? parseInt(mesParam, 10) : now.getMonth() + 1

    if (isNaN(ano) || isNaN(mes) || mes < 1 || mes > 12) {
      return apiError('Parâmetros ano/mes inválidos', 400)
    }

    // Determine target user
    let targetUserId = session.user.id
    if (utilizadorIdParam && utilizadorIdParam !== session.user.id) {
      // Need elevated permission to view other users' records
      const canViewAll = hasPermission(role, 'ajudas:read:all')
      const canViewBrigade = hasPermission(role, 'ajudas:read:brigade')
      if (!canViewAll && !canViewBrigade) {
        return apiError('Sem permissão para ver registos de outros utilizadores', 403)
      }

      // If brigade-level, verify the target user is in the same brigade
      if (!canViewAll && canViewBrigade) {
        const targetUser = await prisma.utilizador.findUnique({
          where: { id: utilizadorIdParam },
          select: { brigadaId: true },
        })
        if (!targetUser || !targetUser.brigadaId || !session.user.brigadaId || targetUser.brigadaId !== session.user.brigadaId) {
          return apiError('Sem permissão para ver registos deste utilizador', 403)
        }
      }

      targetUserId = utilizadorIdParam
    }

    // Find or create registo
    const registo = await prisma.ajudasRegisto.upsert({
      where: {
        utilizadorId_ano_mes: {
          utilizadorId: targetUserId,
          ano,
          mes,
        },
      },
      create: {
        utilizadorId: targetUserId,
        ano,
        mes,
      },
      update: {},
      include: {
        linhas: {
          orderBy: { dataInicio: 'asc' },
          include: { viatura: { select: { id: true, nome: true, matricula: true } } },
        },
      },
    })

    // Get config and user overrides in parallel, and also fetch linhas from
    // adjacent registos that have dates falling in this target month so that
    // cross-month prevention intervals and late-filed entries are attributed
    // to the correct month.
    const startOfMonth = new Date(Date.UTC(ano, mes - 1, 1))
    const startOfNextMonth = new Date(Date.UTC(ano, mes, 1))

    const [config, targetUserData, crossMonthLinhas] = await Promise.all([
      prisma.ajudasConfig.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} }),
      prisma.utilizador.findUnique({
        where: { id: targetUserId },
        select: { ajudasVencimentoBase: true, ajudasTaxaIRS: true },
      }),
      prisma.ajudasLinha.findMany({
        where: {
          registo: {
            utilizadorId: targetUserId,
            NOT: { id: registo.id },
          },
          OR: [
            // Ajudas de custo / piquete: entry starts in target month
            { dataInicio: { gte: startOfMonth, lt: startOfNextMonth } },
            // Prevenção passiva: interval overlaps with target month
            {
              prevencao: 'PREVENCAO_PASSIVA',
              dataInicio: { lt: startOfNextMonth },
              dataFim: { gte: startOfMonth },
            },
          ],
        },
        orderBy: { dataInicio: 'asc' },
        include: { viatura: { select: { id: true, nome: true, matricula: true } } },
      }),
    ])

    const vencimentoBase = targetUserData?.ajudasVencimentoBase
    const taxaIRS = targetUserData?.ajudasTaxaIRS
    const userConfigured = vencimentoBase != null && taxaIRS != null

    const allLinhas = [...registo.linhas, ...crossMonthLinhas]
    const totais = userConfigured
      ? calcAjudasTotais(allLinhas, config, vencimentoBase!, taxaIRS!, ano, mes)
      : null

    return Response.json({ registo, config, totais, userConfigured })
  } catch (error) {
    return handleApiError(error)
  }
}
