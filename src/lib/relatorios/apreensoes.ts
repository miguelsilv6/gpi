import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import { buildInqueritoWhere } from '@/lib/role-scope'
import type { RelatorioHandler, RelatorioRow, RelatorioSummaryItem } from './types'
import { RELATORIO_ROW_LIMIT } from './types'
import { parseDateOrNull, fmtDate, endOfDay } from './shared'
import {
  TIPO_APREENSAO,
  ESTADO_APREENSAO_LABEL,
} from '@/lib/validations/apreensao'
import {
  ESTADOS_APREENSAO_ATIVOS,
  ESTADOS_APREENSAO_TERMINAIS,
  apreensaoTipoLabel,
} from '@/lib/apreensoes'
import type { EstadoApreensao, TipoApreensao } from '@/generated/prisma/enums'

/**
 * Relatório "Apreensões".
 *
 * Uma linha por objeto apreendido, com o inquérito (NUIPC/inspetor/brigada) a
 * que pertence. O scope de leitura respeita `buildInqueritoWhere` aplicado à
 * relação `inquerito` (mesmo padrão de `getApreensoesGlobal`).
 *
 * Filtros (querystring):
 *   - estado: 'em-custodia' | 'concluidas' | ''(todas)  — grupos como na página global
 *   - tipo:   um dos TIPO_APREENSAO
 *   - brigadaId / inspetorId
 *   - dataApreensaoFrom / dataApreensaoTo (ISO YYYY-MM-DD)
 */
export const queryApreensoes: RelatorioHandler = async (filters, session) => {
  const estadoGrupo = filters.get('estado') ?? ''
  const tipo = filters.get('tipo') ?? ''
  const brigadaId = filters.get('brigadaId') ?? ''
  const inspetorId = filters.get('inspetorId') ?? ''
  const dataFrom = parseDateOrNull(filters.get('dataApreensaoFrom'))
  const dataTo = parseDateOrNull(filters.get('dataApreensaoTo'))

  const roleWhere = buildInqueritoWhere(session.role, session.id, session.brigadaId)
  const inqueritoWhere: Prisma.InqueritoWhereInput = {
    AND: [
      { deletedAt: null },
      roleWhere,
      ...(brigadaId ? [{ brigadaId }] : []),
      ...(inspetorId ? [{ inspetorId }] : []),
    ],
  }

  const estadoWhere: Prisma.ApreensaoWhereInput =
    estadoGrupo === 'em-custodia'
      ? { estado: { in: [...ESTADOS_APREENSAO_ATIVOS] } }
      : estadoGrupo === 'concluidas'
        ? { estado: { in: [...ESTADOS_APREENSAO_TERMINAIS] } }
        : {}

  // Só aplica o filtro de tipo se for um valor conhecido (evita passar lixo ao enum).
  const tipoValido = (TIPO_APREENSAO as readonly string[]).includes(tipo)

  const dataRange: Prisma.DateTimeFilter | undefined =
    dataFrom || dataTo
      ? { ...(dataFrom && { gte: dataFrom }), ...(dataTo && { lte: endOfDay(dataTo) }) }
      : undefined

  const where: Prisma.ApreensaoWhereInput = {
    inquerito: inqueritoWhere,
    ...estadoWhere,
    ...(tipoValido && { tipo: tipo as TipoApreensao }),
    ...(dataRange && { dataApreensao: dataRange }),
  }

  const total = await prisma.apreensao.count({ where })
  if (total > RELATORIO_ROW_LIMIT) {
    throw new Error(
      `Limite de ${RELATORIO_ROW_LIMIT} registos por relatório. Total filtrado: ${total}. Refine os filtros.`,
      { cause: 413 },
    )
  }

  const items = await prisma.apreensao.findMany({
    where,
    orderBy: [{ dataApreensao: 'desc' }, { createdAt: 'desc' }],
    take: RELATORIO_ROW_LIMIT,
    select: {
      descricao: true,
      tipo: true,
      tipoOutro: true,
      quantidade: true,
      numeroAuto: true,
      dataApreensao: true,
      local: true,
      apreendidoA: true,
      localCustodia: true,
      estado: true,
      dataDestino: true,
      inquerito: {
        select: {
          nuipc: true,
          inspetor: { select: { nome: true } },
          brigada: { select: { nome: true } },
        },
      },
    },
  })

  const porEstado = new Map<string, number>()
  const porTipo = new Map<string, number>()
  for (const a of items) {
    const estadoNome = ESTADO_APREENSAO_LABEL[a.estado as EstadoApreensao]
    porEstado.set(estadoNome, (porEstado.get(estadoNome) ?? 0) + 1)
    const tipoNome = apreensaoTipoLabel(a.tipo, a.tipoOutro)
    porTipo.set(tipoNome, (porTipo.get(tipoNome) ?? 0) + 1)
  }
  const summary: RelatorioSummaryItem[] = [
    { label: 'Total', value: items.length },
    ...Array.from(porEstado.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-PT'))
      .map(([nome, n]) => ({ label: nome, value: n })),
  ]

  const rows: RelatorioRow[] = items.map((a) => ({
    nuipc: a.inquerito.nuipc,
    inspetor: a.inquerito.inspetor?.nome ?? '— Sem inspetor —',
    brigada: a.inquerito.brigada?.nome ?? '',
    descricao: a.descricao,
    tipo: apreensaoTipoLabel(a.tipo, a.tipoOutro),
    quantidade: a.quantidade ?? '',
    numeroAuto: a.numeroAuto ?? '',
    dataApreensao: fmtDate(a.dataApreensao),
    local: a.local ?? '',
    apreendidoA: a.apreendidoA ?? '',
    estado: ESTADO_APREENSAO_LABEL[a.estado as EstadoApreensao],
    dataDestino: fmtDate(a.dataDestino),
  }))

  return {
    title: 'Relatório de Apreensões',
    geradoEm: new Date(),
    geradoPor: session.nome,
    filtros: {
      Estado:
        estadoGrupo === 'em-custodia'
          ? 'Em custódia'
          : estadoGrupo === 'concluidas'
            ? 'Concluídas'
            : 'Todas',
      Tipo: tipoValido ? apreensaoTipoLabel(tipo, null) : null,
      Brigada: brigadaId || null,
      Inspetor: inspetorId || null,
      'Data (De)': fmtDate(dataFrom) || null,
      'Data (Até)': fmtDate(dataTo) || null,
    },
    columns: [
      { key: 'nuipc', label: 'NUIPC', flex: 1.0 },
      { key: 'inspetor', label: 'Inspetor', flex: 1.0 },
      { key: 'brigada', label: 'Brigada', flex: 0.9 },
      { key: 'descricao', label: 'Objeto', flex: 1.8 },
      { key: 'tipo', label: 'Tipo', flex: 1.0 },
      { key: 'quantidade', label: 'Qtd.', flex: 0.6 },
      { key: 'numeroAuto', label: 'Nº Auto', flex: 0.8 },
      { key: 'dataApreensao', label: 'Data Apreensão', flex: 0.85 },
      { key: 'local', label: 'Local', flex: 1.1 },
      { key: 'apreendidoA', label: 'Apreendido a', flex: 1.1 },
      { key: 'estado', label: 'Estado', flex: 1.0 },
      { key: 'dataDestino', label: 'Data Destino', flex: 0.85 },
    ],
    rows,
    summary,
    emptyMessage: 'Nenhuma apreensão corresponde aos filtros aplicados.',
  }
}
