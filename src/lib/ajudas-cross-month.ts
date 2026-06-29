import { prisma } from '@/lib/prisma'

/**
 * Loads linhas from registos OTHER than registoId whose interval overlaps the
 * target month, i.e. any entry that starts before the next month and ends on or
 * after the first of the month. This covers both prevenção passiva that
 * straddles the month boundary and overtime/piquete shifts that cross midnight
 * at month-end (e.g. 22:00 of the 31st → 02:00 of the 1st): in either case the
 * day-by-day engine (calcAjudasTotais/calcLinhaValor) attributes each day/hour
 * to the right month, so the entry must surface in every month it touches.
 * Used so that GET and POST/PUT/DELETE responses are consistent.
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
      dataInicio: { lt: startOfNextMonth },
      dataFim: { gte: startOfMonth },
    },
    orderBy: { dataInicio: 'asc' },
    include: { viatura: { select: { id: true, nome: true, matricula: true } } },
  })
}
