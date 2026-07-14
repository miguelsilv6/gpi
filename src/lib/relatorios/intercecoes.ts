import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import { buildInqueritoWhere } from '@/lib/role-scope'
import type { RelatorioHandler, RelatorioRow, RelatorioSummaryItem } from './types'
import { RELATORIO_ROW_LIMIT } from './types'
import { fmtDate } from './shared'
import { A_EXPIRAR_DIAS } from '@/lib/intercecoes'
import { TIPO_LINHA_VALUES, TIPO_LINHA_LABEL, estadoLinha } from '@/lib/validations/intercecao'
import { diasRestantes } from '@/lib/prazos'
import type { TipoLinhaIntercecao } from '@/generated/prisma/enums'

/**
 * Relatório "Interceções".
 *
 * Uma linha por linha intercetada (SIM/IMEI/…), com o alvo (suspeito) e o
 * inquérito a que pertence. Scope de leitura via `buildInqueritoWhere` na
 * relação `alvo.inquerito` (como `getLinhasGlobal`).
 *
 * Filtros (querystring):
 *   - estado: 'ativas' | 'a-expirar' | ''(todas)
 *       · ativas    = data de fim ainda não passou (dataFim ≥ início de hoje)
 *       · a-expirar = termina nos próximos A_EXPIRAR_DIAS (janela fixa, como
 *                     na página global — o 1.º aviso por linha pode diferir)
 *   - tipo: SIM | IMEI | OUTRO
 *   - brigadaId / inspetorId (do inquérito)
 */
export const queryIntercecoes: RelatorioHandler = async (filters, session) => {
  const estado = filters.get('estado') ?? ''
  const tipo = filters.get('tipo') ?? ''
  const brigadaId = filters.get('brigadaId') ?? ''
  const inspetorId = filters.get('inspetorId') ?? ''

  const now = new Date()
  const inicioHoje = new Date(now)
  inicioHoje.setHours(0, 0, 0, 0)
  const fimJanela = new Date(inicioHoje)
  fimJanela.setDate(fimJanela.getDate() + A_EXPIRAR_DIAS)
  fimJanela.setHours(23, 59, 59, 999)

  const roleWhere = buildInqueritoWhere(session.role, session.id, session.brigadaId)
  const inqueritoWhere: Prisma.InqueritoWhereInput = {
    AND: [
      { deletedAt: null },
      roleWhere,
      ...(brigadaId ? [{ brigadaId }] : []),
      ...(inspetorId ? [{ inspetorId }] : []),
    ],
  }

  const tipoValido = (TIPO_LINHA_VALUES as readonly string[]).includes(tipo)

  const where: Prisma.IntercecaoLinhaWhereInput = {
    alvo: { inquerito: inqueritoWhere },
    ...(estado === 'ativas' && { dataFim: { gte: inicioHoje } }),
    ...(estado === 'a-expirar' && { dataFim: { gte: inicioHoje, lte: fimJanela } }),
    ...(tipoValido && { tipo: tipo as TipoLinhaIntercecao }),
  }

  const total = await prisma.intercecaoLinha.count({ where })
  if (total > RELATORIO_ROW_LIMIT) {
    throw new Error(
      `Limite de ${RELATORIO_ROW_LIMIT} registos por relatório. Total filtrado: ${total}. Refine os filtros.`,
      { cause: 413 },
    )
  }

  const items = await prisma.intercecaoLinha.findMany({
    where,
    orderBy: [{ dataFim: 'asc' }, { createdAt: 'asc' }],
    take: RELATORIO_ROW_LIMIT,
    select: {
      codigo: true,
      tipo: true,
      identificador: true,
      rede: true,
      dataInicio: true,
      dataFim: true,
      renovacoes: true,
      alvo: {
        select: {
          nome: true,
          inquerito: {
            select: {
              nuipc: true,
              inspetor: { select: { nome: true } },
              brigada: { select: { nome: true } },
            },
          },
        },
      },
    },
  })

  const porEstado = new Map<string, number>()
  for (const l of items) {
    const est = estadoLinha(l.dataFim, now) === 'ativa' ? 'Ativas' : 'Terminadas'
    porEstado.set(est, (porEstado.get(est) ?? 0) + 1)
  }
  const summary: RelatorioSummaryItem[] = [
    { label: 'Total', value: items.length },
    ...Array.from(porEstado.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-PT'))
      .map(([nome, n]) => ({ label: nome, value: n })),
  ]

  const rows: RelatorioRow[] = items.map((l) => {
    const ativa = estadoLinha(l.dataFim, now) === 'ativa'
    const dias = diasRestantes(l.dataFim, now)
    return {
      nuipc: l.alvo.inquerito.nuipc,
      inspetor: l.alvo.inquerito.inspetor?.nome ?? '— Sem inspetor —',
      brigada: l.alvo.inquerito.brigada?.nome ?? '',
      alvo: l.alvo.nome,
      codigo: l.codigo,
      tipo: TIPO_LINHA_LABEL[l.tipo as TipoLinhaIntercecao],
      identificador: l.identificador,
      rede: l.rede ?? '',
      dataInicio: fmtDate(l.dataInicio),
      dataFim: fmtDate(l.dataFim),
      renovacoes: l.renovacoes,
      estado: ativa ? 'Ativa' : 'Terminada',
      diasRestantes: ativa ? dias : '',
    }
  })

  return {
    title: 'Relatório de Interceções',
    geradoEm: new Date(),
    geradoPor: session.nome,
    filtros: {
      Estado:
        estado === 'ativas'
          ? 'Ativas'
          : estado === 'a-expirar'
            ? `A expirar (${A_EXPIRAR_DIAS} dias)`
            : 'Todas',
      Tipo: tipoValido ? TIPO_LINHA_LABEL[tipo as TipoLinhaIntercecao] : null,
      Brigada: brigadaId || (session.role === 'INSPETOR_CHEFE' ? session.brigadaId : null),
      Inspetor: inspetorId || null,
    },
    columns: [
      { key: 'nuipc', label: 'NUIPC', flex: 1.0 },
      { key: 'inspetor', label: 'Inspetor', flex: 1.0 },
      { key: 'brigada', label: 'Brigada', flex: 0.9 },
      { key: 'alvo', label: 'Alvo / suspeito', flex: 1.4 },
      { key: 'codigo', label: 'Código', flex: 0.8 },
      { key: 'tipo', label: 'Tipo', flex: 0.8 },
      { key: 'identificador', label: 'Identificador', flex: 1.2 },
      { key: 'rede', label: 'Rede', flex: 0.9 },
      { key: 'dataInicio', label: 'Início', flex: 0.8 },
      { key: 'dataFim', label: 'Fim', flex: 0.8 },
      { key: 'renovacoes', label: 'Renov.', flex: 0.6, align: 'right' },
      { key: 'estado', label: 'Estado', flex: 0.8 },
      { key: 'diasRestantes', label: 'Dias rest.', flex: 0.7, align: 'right' },
    ],
    rows,
    summary,
    emptyMessage: 'Nenhuma linha de interceção corresponde aos filtros aplicados.',
  }
}
