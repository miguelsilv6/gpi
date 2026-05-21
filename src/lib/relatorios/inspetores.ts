import { prisma } from '@/lib/prisma'
import type { RelatorioHandler, RelatorioRow } from './types'
import { parseDateOrNull, fmtDate, endOfDay } from './shared'

/**
 * Relatório "Resumo por inspetor".
 *
 * Por cada inspetor activo no scope, dentro de [dataAberturaFrom, dataAberturaTo]:
 *   - Atribuídos no período      = inqueritos.dataAbertura no intervalo
 *                                  + inspetorId = user
 *   - Concluídos no período      = inqueritos.dataConclusao no intervalo
 *                                  + inspetorId = user
 *   - Ativos hoje                = estado.terminal=false + inspetorId = user
 *   - Atividades realizadas      = count Atividade no intervalo de
 *                                  dataRealizacao
 *   - Atividades (× quantidade)  = soma de quantidade (default 1) das mesmas
 *
 * Filtros:
 *   - dataAberturaFrom / dataAberturaTo
 *   - brigadaId                  (opcional)
 *   - inspetorIds (csv)          (opcional)
 *
 * Scope:
 *   - INSPETOR_CHEFE → brigadaId forçada à sua brigada (ignora parâmetro)
 */
export const queryInspetores: RelatorioHandler = async (filters, session) => {
  const dataFrom = parseDateOrNull(filters.get('dataAberturaFrom'))
  const dataTo = parseDateOrNull(filters.get('dataAberturaTo'))
  let brigadaId = filters.get('brigadaId') ?? ''
  const inspetorIds = (filters.get('inspetorIds') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (session.role === 'INSPETOR_CHEFE') {
    brigadaId = session.brigadaId ?? '__no_brigada__'
  }

  const inspetores = await prisma.utilizador.findMany({
    where: {
      ativo: true,
      role: 'INSPETOR',
      ...(brigadaId && { brigadaId }),
      ...(inspetorIds.length > 0 && { id: { in: inspetorIds } }),
    },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, brigada: { select: { nome: true } } },
  })

  const periodoRange =
    dataFrom || dataTo
      ? {
          ...(dataFrom && { gte: dataFrom }),
          ...(dataTo && { lte: endOfDay(dataTo) }),
        }
      : undefined

  const linhas = await Promise.all(
    inspetores.map(async (u) => {
      const baseAtivos = {
        inspetorId: u.id,
        deletedAt: null,
        estado: { terminal: false },
      } as const

      const [atribuidosPeriodo, concluidosPeriodo, ativosHoje, atividadesAgg] = await Promise.all([
        prisma.inquerito.count({
          where: {
            inspetorId: u.id,
            deletedAt: null,
            ...(periodoRange && { dataAbertura: periodoRange }),
          },
        }),
        prisma.inquerito.count({
          where: {
            inspetorId: u.id,
            deletedAt: null,
            dataConclusao: { not: null },
            ...(periodoRange && { dataConclusao: periodoRange }),
          },
        }),
        prisma.inquerito.count({ where: baseAtivos }),
        prisma.atividade.aggregate({
          where: {
            utilizadorId: u.id,
            ...(periodoRange && { dataRealizacao: periodoRange }),
          },
          _count: { _all: true },
          _sum: { quantidade: true },
        }),
      ])

      const count = atividadesAgg._count._all
      const somaQuantidade = atividadesAgg._sum.quantidade
      // Quando quantidade é null tratamos como 1 (mesma convenção que a
      // estatística mensal). Como _sum só soma valores não-nulos, contamos
      // separadamente os null e somamos como 1 cada.
      const nullsCount = await prisma.atividade.count({
        where: {
          utilizadorId: u.id,
          quantidade: null,
          ...(periodoRange && { dataRealizacao: periodoRange }),
        },
      })
      const atividadesPonderado = (somaQuantidade ?? 0) + nullsCount

      return {
        inspetor: u.nome,
        brigada: u.brigada?.nome ?? '',
        atribuidosPeriodo,
        concluidosPeriodo,
        ativosHoje,
        atividades: count,
        atividadesPonderado,
      }
    }),
  )

  const rows: RelatorioRow[] = linhas.map((l) => ({ ...l }))

  if (linhas.length > 1) {
    const tot = linhas.reduce(
      (acc, l) => ({
        atribuidosPeriodo: acc.atribuidosPeriodo + l.atribuidosPeriodo,
        concluidosPeriodo: acc.concluidosPeriodo + l.concluidosPeriodo,
        ativosHoje: acc.ativosHoje + l.ativosHoje,
        atividades: acc.atividades + l.atividades,
        atividadesPonderado: acc.atividadesPonderado + l.atividadesPonderado,
      }),
      { atribuidosPeriodo: 0, concluidosPeriodo: 0, ativosHoje: 0, atividades: 0, atividadesPonderado: 0 },
    )
    rows.push({
      inspetor: 'Total',
      brigada: '',
      atribuidosPeriodo: tot.atribuidosPeriodo,
      concluidosPeriodo: tot.concluidosPeriodo,
      ativosHoje: tot.ativosHoje,
      atividades: tot.atividades,
      atividadesPonderado: tot.atividadesPonderado,
    })
  }

  return {
    title: 'Resumo por inspetor',
    geradoEm: new Date(),
    geradoPor: session.nome,
    filtros: {
      'Data Abertura (De)': fmtDate(dataFrom) || null,
      'Data Abertura (Até)': fmtDate(dataTo) || null,
      Brigada: brigadaId || null,
      Inspetores: inspetorIds.length > 0 ? inspetorIds.join(', ') : null,
    },
    columns: [
      { key: 'inspetor', label: 'Inspetor' },
      { key: 'brigada', label: 'Brigada' },
      { key: 'atribuidosPeriodo', label: 'Atribuídos no período', align: 'right' },
      { key: 'concluidosPeriodo', label: 'Concluídos no período', align: 'right' },
      { key: 'ativosHoje', label: 'Ativos hoje', align: 'right' },
      { key: 'atividades', label: 'Atividades realizadas', align: 'right' },
      { key: 'atividadesPonderado', label: 'Atividades × quantidade', align: 'right' },
    ],
    rows,
    emptyMessage: 'Não foram encontrados inspetores activos no scope filtrado.',
  }
}
