import { prisma } from '@/lib/prisma'
import type { RelatorioHandler, RelatorioRow } from './types'
import { parseDateOrNull, fmtDate, endOfDay } from './shared'

/**
 * Relatório "Resumo por brigada".
 *
 * Por cada brigada, dentro do período [dataAberturaFrom, dataAberturaTo]:
 *   - Abertos no período      = inqueritos com dataAbertura no intervalo
 *   - Concluídos no período   = inqueritos com dataConclusao no intervalo
 *   - Ativos hoje             = estado.terminal=false (independente do período)
 *   - Aguarda exames          = inqueritos ativos com atividade do padrão
 *                                AGUARDA_EXAMES por concluir
 *   - Enviados                = inqueritos ativos com atividade do padrão
 *                                ENVIADO por concluir
 *   - Prazos vencidos         = inqueritos ativos com atividade cujo
 *                                dataPrazo < hoje E concluidaEm IS NULL
 *
 * Filtros:
 *   - dataAberturaFrom / dataAberturaTo
 *   - brigadaIds (csv) — opcional; default = todas as brigadas activas (ou só
 *     a do user quando INSPETOR_CHEFE)
 */
export const queryBrigadas: RelatorioHandler = async (filters, session) => {
  const dataFrom = parseDateOrNull(filters.get('dataAberturaFrom'))
  const dataTo = parseDateOrNull(filters.get('dataAberturaTo'))
  const brigadaIdsParam = filters.get('brigadaIds') ?? ''
  const brigadaIds = brigadaIdsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  // INSPETOR_CHEFE força a sua própria brigada
  const scopedIds = (() => {
    if (session.role === 'INSPETOR_CHEFE') {
      return session.brigadaId ? [session.brigadaId] : []
    }
    return brigadaIds
  })()

  const brigadas = await prisma.brigada.findMany({
    where: {
      ativa: true,
      ...(scopedIds.length > 0 && { id: { in: scopedIds } }),
    },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true },
  })

  // Padrões "AGUARDA_EXAMES" / "ENVIADO" — lookup por nome (igual ao dashboard).
  const padroes = await prisma.atividadePadrao.findMany({
    where: { ativa: true, categoriaDashboard: { not: null } },
    select: { nome: true, categoriaDashboard: true },
  })
  const nomesAguarda = padroes
    .filter((p) => p.categoriaDashboard === 'AGUARDA_EXAMES')
    .map((p) => p.nome)
  const nomesEnviados = padroes
    .filter((p) => p.categoriaDashboard === 'ENVIADO')
    .map((p) => p.nome)

  const periodoAberturaRange =
    dataFrom || dataTo
      ? {
          ...(dataFrom && { gte: dataFrom }),
          ...(dataTo && { lte: endOfDay(dataTo) }),
        }
      : undefined
  const periodoConclusaoRange = periodoAberturaRange

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  // Para cada brigada, fazer todas as contagens em paralelo.
  const linhas = await Promise.all(
    brigadas.map(async (b) => {
      const baseAtivos = {
        brigadaId: b.id,
        deletedAt: null,
        estado: { terminal: false },
      } as const

      const [abertosPeriodo, concluidosPeriodo, ativosHoje, aguarda, enviados, vencidos] =
        await Promise.all([
          prisma.inquerito.count({
            where: {
              brigadaId: b.id,
              deletedAt: null,
              ...(periodoAberturaRange && { dataAbertura: periodoAberturaRange }),
            },
          }),
          prisma.inquerito.count({
            where: {
              brigadaId: b.id,
              deletedAt: null,
              dataConclusao: { not: null },
              ...(periodoConclusaoRange && { dataConclusao: periodoConclusaoRange }),
            },
          }),
          prisma.inquerito.count({ where: baseAtivos }),
          nomesAguarda.length === 0
            ? 0
            : prisma.inquerito.count({
                where: {
                  ...baseAtivos,
                  atividades: {
                    some: { descricao: { in: nomesAguarda }, concluidaEm: null },
                  },
                },
              }),
          nomesEnviados.length === 0
            ? 0
            : prisma.inquerito.count({
                where: {
                  ...baseAtivos,
                  atividades: {
                    some: { descricao: { in: nomesEnviados }, concluidaEm: null },
                  },
                },
              }),
          prisma.inquerito.count({
            where: {
              ...baseAtivos,
              atividades: { some: { dataPrazo: { lt: hoje }, concluidaEm: null } },
            },
          }),
        ])

      return {
        brigada: b.nome,
        abertosPeriodo,
        concluidosPeriodo,
        ativosHoje,
        aguarda,
        enviados,
        vencidos,
      }
    }),
  )

  // Linha "Total" no fim (apenas se mais que uma brigada listada).
  const rows: RelatorioRow[] = linhas.map((l) => ({
    brigada: l.brigada,
    abertosPeriodo: l.abertosPeriodo,
    concluidosPeriodo: l.concluidosPeriodo,
    ativosHoje: l.ativosHoje,
    aguarda: l.aguarda,
    enviados: l.enviados,
    vencidos: l.vencidos,
  }))

  if (linhas.length > 1) {
    const totais = linhas.reduce(
      (acc, l) => ({
        abertosPeriodo: acc.abertosPeriodo + l.abertosPeriodo,
        concluidosPeriodo: acc.concluidosPeriodo + l.concluidosPeriodo,
        ativosHoje: acc.ativosHoje + l.ativosHoje,
        aguarda: acc.aguarda + l.aguarda,
        enviados: acc.enviados + l.enviados,
        vencidos: acc.vencidos + l.vencidos,
      }),
      { abertosPeriodo: 0, concluidosPeriodo: 0, ativosHoje: 0, aguarda: 0, enviados: 0, vencidos: 0 },
    )
    rows.push({
      brigada: 'Total',
      abertosPeriodo: totais.abertosPeriodo,
      concluidosPeriodo: totais.concluidosPeriodo,
      ativosHoje: totais.ativosHoje,
      aguarda: totais.aguarda,
      enviados: totais.enviados,
      vencidos: totais.vencidos,
    })
  }

  return {
    title: 'Resumo por brigada',
    geradoEm: new Date(),
    geradoPor: session.nome,
    filtros: {
      'Data Abertura (De)': fmtDate(dataFrom) || null,
      'Data Abertura (Até)': fmtDate(dataTo) || null,
      Brigadas: brigadaIds.length > 0 ? brigadaIds.join(', ') : null,
    },
    columns: [
      { key: 'brigada', label: 'Brigada' },
      { key: 'abertosPeriodo', label: 'Abertos no período', align: 'right' },
      { key: 'concluidosPeriodo', label: 'Concluídos no período', align: 'right' },
      { key: 'ativosHoje', label: 'Ativos hoje', align: 'right' },
      { key: 'aguarda', label: 'Aguarda exames', align: 'right' },
      { key: 'enviados', label: 'Enviados', align: 'right' },
      { key: 'vencidos', label: 'Prazos vencidos', align: 'right' },
    ],
    rows,
    emptyMessage: 'Não foram encontradas brigadas activas.',
  }
}
