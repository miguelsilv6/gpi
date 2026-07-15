/**
 * Intervalos de dias em UTC para filtros de data (querystring `YYYY-MM-DD`).
 *
 * As datas dos filtros da UI são dias inteiros, inclusivos em ambos os
 * extremos. Um `new Date('2026-07-14')` resolve para a **meia-noite UTC** desse
 * dia — usá-lo como `lte` exclui silenciosamente tudo o que aconteça DURANTE
 * o último dia (bug clássico de fim-de-intervalo). Estes helpers tornam a
 * intenção explícita e evitam que rotas-irmãs voltem a divergir.
 */

/** Início do dia (00:00:00.000Z) — extremo inferior inclusivo. */
export function startOfDayUTC(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

/** Fim do dia (23:59:59.999Z) — extremo superior inclusivo. */
export function endOfDayUTC(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`)
}

/**
 * Filtro Prisma `{ gte?, lte? }` para um intervalo inclusivo de dias UTC.
 * Devolve `undefined` quando não há qualquer extremo (para poder ser espalhado
 * condicionalmente num `where`).
 */
export function utcDayRangeFilter(
  from?: string | null,
  to?: string | null,
): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined
  return {
    ...(from ? { gte: startOfDayUTC(from) } : {}),
    ...(to ? { lte: endOfDayUTC(to) } : {}),
  }
}
