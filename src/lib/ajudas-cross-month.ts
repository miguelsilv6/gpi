import { prisma } from '@/lib/prisma'

/**
 * Loads linhas from registos OTHER than registoId whose dates overlap the
 * target month — either because dataInicio falls in the month (covers ajudas
 * de custo and piquete) or because a PREVENCAO_PASSIVA interval straddles the
 * month boundary.  Used so that POST/PUT/DELETE responses are consistent with
 * the GET endpoint which also includes these cross-month entries.
 */
export async function loadCrossMonthLinhas(
  utilizadorId: string,
  ano: number,
  mes: number,
  registoId: string,
) {
  const startOfMonth = new Date(Date.UTC(ano, mes - 1, 1))
  const startOfNextMonth = new Date(Date.UTC(ano, mes, 1))

  return prisma.ajudasLinha.findMany({
    where: {
      registo: {
        utilizadorId,
        NOT: { id: registoId },
      },
      OR: [
        { dataInicio: { gte: startOfMonth, lt: startOfNextMonth } },
        {
          prevencao: 'PREVENCAO_PASSIVA',
          dataInicio: { lt: startOfNextMonth },
          dataFim: { gte: startOfMonth },
        },
      ],
    },
    orderBy: { dataInicio: 'asc' },
    include: { viatura: { select: { id: true, nome: true, matricula: true } } },
  })
}
