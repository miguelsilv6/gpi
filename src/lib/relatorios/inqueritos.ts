import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import { buildInqueritoWhere } from '@/lib/role-scope'
import type { RelatorioHandler, RelatorioRow } from './types'
import { RELATORIO_ROW_LIMIT } from './types'
import { parseDateOrNull, fmtDate, endOfDay } from './shared'

/**
 * Relatório "Listagem de inquéritos".
 *
 * Filtros aceites (querystring):
 *   - dataAberturaFrom, dataAberturaTo  (ISO YYYY-MM-DD)
 *   - estado                            (codigo)
 *   - brigadaId
 *   - crimeId
 *   - inspetorId
 *
 * Scope: respeita `buildInqueritoWhere` (INSPETOR_CHEFE limitado à brigada).
 */
export const queryInqueritos: RelatorioHandler = async (filters, session) => {
  const dataAberturaFrom = parseDateOrNull(filters.get('dataAberturaFrom'))
  const dataAberturaTo = parseDateOrNull(filters.get('dataAberturaTo'))
  const estadoCodigo = filters.get('estado') ?? ''
  const brigadaId = filters.get('brigadaId') ?? ''
  const crimeId = filters.get('crimeId') ?? ''
  const inspetorId = filters.get('inspetorId') ?? ''

  const roleWhere = buildInqueritoWhere(session.role, session.id, session.brigadaId)
  const dataAberturaRange: Prisma.DateTimeFilter | undefined =
    dataAberturaFrom || dataAberturaTo
      ? {
          ...(dataAberturaFrom && { gte: dataAberturaFrom }),
          ...(dataAberturaTo && { lte: endOfDay(dataAberturaTo) }),
        }
      : undefined

  const where: Prisma.InqueritoWhereInput = {
    deletedAt: null,
    ...(dataAberturaRange && { dataAbertura: dataAberturaRange }),
    ...(estadoCodigo && { estado: { codigo: estadoCodigo } }),
    ...(brigadaId && { brigadaId }),
    ...(crimeId && { crimeId }),
    ...(inspetorId && { inspetorId }),
    // roleWhere LAST: garante que INSPETOR_CHEFE/INSPETOR não escapam ao
    // scope da brigada/utilizador via injecção de ?brigadaId/?inspetorId
    // na URL. Esta ordem é crítica para a segurança.
    ...roleWhere,
  }

  const total = await prisma.inquerito.count({ where })
  if (total > RELATORIO_ROW_LIMIT) {
    throw new Error(
      `Limite de ${RELATORIO_ROW_LIMIT} registos por relatório. Total filtrado: ${total}. Refine os filtros.`,
      { cause: 413 },
    )
  }

  const inqueritos = await prisma.inquerito.findMany({
    where,
    orderBy: [{ dataAbertura: 'desc' }, { nuipc: 'asc' }],
    take: RELATORIO_ROW_LIMIT,
    select: {
      nuipc: true,
      nai: true,
      natureza: true,
      crime: { select: { nome: true } },
      estado: { select: { codigo: true, nome: true } },
      brigada: { select: { nome: true } },
      inspetor: { select: { nome: true } },
      dataAbertura: true,
      dataPrazo: true,
      dataConclusao: true,
    },
  })

  // Sumário: contagens por estado (ordenado por nome).
  const porEstado = new Map<string, number>()
  for (const inq of inqueritos) {
    const nome = inq.estado.nome
    porEstado.set(nome, (porEstado.get(nome) ?? 0) + 1)
  }
  const summary = [
    { label: 'Total', value: inqueritos.length },
    ...Array.from(porEstado.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-PT'))
      .map(([nome, n]) => ({ label: nome, value: n })),
  ]

  const rows: RelatorioRow[] = inqueritos.map((i) => ({
    nuipc: i.nuipc,
    nai: i.nai ?? '',
    crime: i.crime?.nome ?? i.natureza ?? '',
    estado: i.estado.nome,
    brigada: i.brigada?.nome ?? '',
    inspetor: i.inspetor?.nome ?? '— Sem inspetor —',
    dataAbertura: fmtDate(i.dataAbertura),
    dataPrazo: fmtDate(i.dataPrazo),
    dataConclusao: fmtDate(i.dataConclusao),
  }))

  return {
    title: 'Listagem de inquéritos',
    geradoEm: new Date(),
    geradoPor: session.nome,
    filtros: {
      'Data Abertura (De)': fmtDate(dataAberturaFrom) || null,
      'Data Abertura (Até)': fmtDate(dataAberturaTo) || null,
      Estado: estadoCodigo || null,
      Brigada: brigadaId || null,
      Crime: crimeId || null,
      Inspetor: inspetorId || null,
    },
    columns: [
      { key: 'nuipc', label: 'NUIPC', flex: 1.1 },
      { key: 'nai', label: 'NAI', flex: 0.8 },
      { key: 'crime', label: 'Crime', flex: 1.8 },
      { key: 'estado', label: 'Estado', flex: 1.0 },
      { key: 'brigada', label: 'Brigada', flex: 1.1 },
      { key: 'inspetor', label: 'Inspetor', flex: 1.1 },
      { key: 'dataAbertura', label: 'Data Abertura', flex: 0.85 },
      { key: 'dataPrazo', label: 'Prazo', flex: 0.75 },
      { key: 'dataConclusao', label: 'Data Conclusão', flex: 0.85 },
    ],
    rows,
    summary,
    emptyMessage: 'Nenhum inquérito corresponde aos filtros aplicados.',
  }
}
