import { prisma } from '@/lib/prisma'
import type { RelatorioHandler, RelatorioRow } from './types'
import { RELATORIO_ROW_LIMIT } from './types'
import { fmtDate } from './shared'

/**
 * Relatório "Inquéritos parados" — inquéritos ativos sem qualquer atividade
 * registada nos últimos N dias (default 30). Inquéritos sem nenhuma atividade
 * contam desde a data de abertura.
 *
 * Filtros:
 *   - dias        — nº de dias sem atividade (default 30, 1–365)
 *   - brigadaId   — opcional; INSPETOR_CHEFE fica preso à sua brigada
 */
export const queryInatividade: RelatorioHandler = async (filters, session) => {
  const diasParam = parseInt(filters.get('dias') ?? '30', 10)
  const dias = Number.isNaN(diasParam) ? 30 : Math.min(365, Math.max(1, diasParam))
  const brigadaIdFiltro = filters.get('brigadaId') ?? ''

  const brigadaId =
    session.role === 'INSPETOR_CHEFE'
      ? (session.brigadaId ?? '__sem_brigada__')
      : brigadaIdFiltro || null

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - dias)

  const inqueritos = await prisma.inquerito.findMany({
    where: {
      deletedAt: null,
      estado: { terminal: false },
      ...(brigadaId && { brigadaId }),
      // Parado = nenhuma atividade criada depois do cutoff. Inquéritos sem
      // atividades também entram (desde que abertos antes do cutoff).
      NOT: { atividades: { some: { createdAt: { gte: cutoff } } } },
      dataAbertura: { lt: cutoff },
    },
    orderBy: { dataAbertura: 'asc' },
    take: RELATORIO_ROW_LIMIT,
    select: {
      nuipc: true,
      dataAbertura: true,
      dataPrazo: true,
      estado: { select: { nome: true } },
      brigada: { select: { nome: true } },
      inspetor: { select: { nome: true } },
      crime: { select: { nome: true } },
      atividades: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true, descricao: true },
      },
    },
  })

  const hoje = new Date()
  const rows: RelatorioRow[] = inqueritos.map((inq) => {
    const ultima = inq.atividades[0] ?? null
    const referencia = ultima?.createdAt ?? inq.dataAbertura
    const diasParado = Math.floor((hoje.getTime() - referencia.getTime()) / 86_400_000)
    return {
      nuipc: inq.nuipc,
      estado: inq.estado.nome,
      brigada: inq.brigada?.nome ?? '—',
      inspetor: inq.inspetor?.nome ?? '—',
      crime: inq.crime?.nome ?? '—',
      ultimaAtividade: ultima ? `${fmtDate(ultima.createdAt)} — ${ultima.descricao}` : 'Nunca',
      diasParado,
      prazo: fmtDate(inq.dataPrazo) || '—',
    }
  })

  // Mais parados primeiro.
  rows.sort((a, b) => (b.diasParado as number) - (a.diasParado as number))

  return {
    title: 'Inquéritos parados',
    geradoEm: new Date(),
    geradoPor: session.nome,
    filtros: {
      'Dias sem atividade': String(dias),
      Brigada: brigadaId && brigadaId !== '__sem_brigada__' ? brigadaId : null,
    },
    columns: [
      { key: 'nuipc', label: 'NUIPC', flex: 1.2 },
      { key: 'estado', label: 'Estado', flex: 1 },
      { key: 'brigada', label: 'Brigada', flex: 1 },
      { key: 'inspetor', label: 'Inspetor', flex: 1.2 },
      { key: 'crime', label: 'Crime', flex: 1.2 },
      { key: 'ultimaAtividade', label: 'Última atividade', flex: 1.8 },
      { key: 'diasParado', label: 'Dias parado', align: 'right', flex: 0.6 },
      { key: 'prazo', label: 'Prazo', flex: 0.8 },
    ],
    rows,
    summary: [
      { label: 'Inquéritos parados', value: rows.length },
      { label: 'Limiar', value: `${dias} dias` },
    ],
    emptyMessage: `Nenhum inquérito ativo está sem atividade há mais de ${dias} dias.`,
  }
}
