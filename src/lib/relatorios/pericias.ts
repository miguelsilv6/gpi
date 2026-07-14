import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import { buildInqueritoWhere } from '@/lib/role-scope'
import type { RelatorioHandler, RelatorioRow, RelatorioSummaryItem } from './types'
import { RELATORIO_ROW_LIMIT } from './types'
import { parseDateOrNull, fmtDate, endOfDay } from './shared'
import { TIPO_PERICIA, ESTADO_PERICIA_LABEL } from '@/lib/validations/pericia'
import {
  ESTADOS_PERICIA_PENDENTES,
  ESTADOS_PERICIA_TERMINAIS,
  periciaTipoLabel,
} from '@/lib/pericias'
import type { EstadoPericia, TipoPericia } from '@/generated/prisma/enums'

/**
 * Relatório "Perícias / Exames".
 *
 * Uma linha por pedido de perícia, com o inquérito a que pertence. Scope de
 * leitura via `buildInqueritoWhere` na relação `inquerito` (como
 * `getPericiasGlobal`). Assinala as perícias atrasadas (pendentes cuja data
 * prevista já passou) no sumário.
 *
 * Filtros (querystring):
 *   - estado: 'pendentes' | 'concluidas' | ''(todas)
 *   - tipo:   um dos TIPO_PERICIA
 *   - brigadaId / inspetorId
 *   - dataPedidoFrom / dataPedidoTo (ISO YYYY-MM-DD)
 */
export const queryPericias: RelatorioHandler = async (filters, session) => {
  const estadoGrupo = filters.get('estado') ?? ''
  const tipo = filters.get('tipo') ?? ''
  const brigadaId = filters.get('brigadaId') ?? ''
  const inspetorId = filters.get('inspetorId') ?? ''
  const dataFrom = parseDateOrNull(filters.get('dataPedidoFrom'))
  const dataTo = parseDateOrNull(filters.get('dataPedidoTo'))

  const roleWhere = buildInqueritoWhere(session.role, session.id, session.brigadaId)
  const inqueritoWhere: Prisma.InqueritoWhereInput = {
    AND: [
      { deletedAt: null },
      roleWhere,
      ...(brigadaId ? [{ brigadaId }] : []),
      ...(inspetorId ? [{ inspetorId }] : []),
    ],
  }

  const estadoWhere: Prisma.PericiaWhereInput =
    estadoGrupo === 'pendentes'
      ? { estado: { in: [...ESTADOS_PERICIA_PENDENTES] } }
      : estadoGrupo === 'concluidas'
        ? { estado: { in: [...ESTADOS_PERICIA_TERMINAIS] } }
        : {}

  const tipoValido = (TIPO_PERICIA as readonly string[]).includes(tipo)

  const dataRange: Prisma.DateTimeFilter | undefined =
    dataFrom || dataTo
      ? { ...(dataFrom && { gte: dataFrom }), ...(dataTo && { lte: endOfDay(dataTo) }) }
      : undefined

  const where: Prisma.PericiaWhereInput = {
    inquerito: inqueritoWhere,
    ...estadoWhere,
    ...(tipoValido && { tipo: tipo as TipoPericia }),
    ...(dataRange && { dataPedido: dataRange }),
  }

  const total = await prisma.pericia.count({ where })
  if (total > RELATORIO_ROW_LIMIT) {
    throw new Error(
      `Limite de ${RELATORIO_ROW_LIMIT} registos por relatório. Total filtrado: ${total}. Refine os filtros.`,
      { cause: 413 },
    )
  }

  const items = await prisma.pericia.findMany({
    where,
    orderBy: [{ dataPedido: 'desc' }, { createdAt: 'desc' }],
    take: RELATORIO_ROW_LIMIT,
    select: {
      tipo: true,
      tipoOutro: true,
      descricao: true,
      entidade: true,
      numeroReferencia: true,
      dataPedido: true,
      dataPrevista: true,
      estado: true,
      dataConclusao: true,
      inquerito: {
        select: {
          nuipc: true,
          inspetor: { select: { nome: true } },
          brigada: { select: { nome: true } },
        },
      },
    },
  })

  const inicioHoje = new Date()
  inicioHoje.setHours(0, 0, 0, 0)
  const pendentes: ReadonlySet<string> = new Set(ESTADOS_PERICIA_PENDENTES)

  const porEstado = new Map<string, number>()
  let atrasadas = 0
  for (const p of items) {
    const estadoNome = ESTADO_PERICIA_LABEL[p.estado as EstadoPericia]
    porEstado.set(estadoNome, (porEstado.get(estadoNome) ?? 0) + 1)
    if (pendentes.has(p.estado) && p.dataPrevista && p.dataPrevista < inicioHoje) {
      atrasadas++
    }
  }
  const summary: RelatorioSummaryItem[] = [
    { label: 'Total', value: items.length },
    ...Array.from(porEstado.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-PT'))
      .map(([nome, n]) => ({ label: nome, value: n })),
    ...(atrasadas > 0 ? [{ label: 'Atrasadas', value: atrasadas }] : []),
  ]

  const rows: RelatorioRow[] = items.map((p) => ({
    nuipc: p.inquerito.nuipc,
    inspetor: p.inquerito.inspetor?.nome ?? '— Sem inspetor —',
    brigada: p.inquerito.brigada?.nome ?? '',
    descricao: p.descricao,
    tipo: periciaTipoLabel(p.tipo, p.tipoOutro),
    entidade: p.entidade ?? '',
    numeroReferencia: p.numeroReferencia ?? '',
    dataPedido: fmtDate(p.dataPedido),
    dataPrevista: fmtDate(p.dataPrevista),
    estado: ESTADO_PERICIA_LABEL[p.estado as EstadoPericia],
    dataConclusao: fmtDate(p.dataConclusao),
  }))

  return {
    title: 'Relatório de Perícias / Exames',
    geradoEm: new Date(),
    geradoPor: session.nome,
    filtros: {
      Estado:
        estadoGrupo === 'pendentes'
          ? 'Pendentes'
          : estadoGrupo === 'concluidas'
            ? 'Concluídas / canceladas'
            : 'Todas',
      Tipo: tipoValido ? periciaTipoLabel(tipo, null) : null,
      Brigada: brigadaId || null,
      Inspetor: inspetorId || null,
      'Data Pedido (De)': fmtDate(dataFrom) || null,
      'Data Pedido (Até)': fmtDate(dataTo) || null,
    },
    columns: [
      { key: 'nuipc', label: 'NUIPC', flex: 1.0 },
      { key: 'inspetor', label: 'Inspetor', flex: 1.0 },
      { key: 'brigada', label: 'Brigada', flex: 0.9 },
      { key: 'descricao', label: 'Perícia', flex: 1.8 },
      { key: 'tipo', label: 'Tipo', flex: 1.1 },
      { key: 'entidade', label: 'Entidade', flex: 1.2 },
      { key: 'numeroReferencia', label: 'Nº Ref.', flex: 0.8 },
      { key: 'dataPedido', label: 'Data Pedido', flex: 0.85 },
      { key: 'dataPrevista', label: 'Prevista', flex: 0.85 },
      { key: 'estado', label: 'Estado', flex: 0.9 },
      { key: 'dataConclusao', label: 'Conclusão', flex: 0.85 },
    ],
    rows,
    summary,
    emptyMessage: 'Nenhuma perícia corresponde aos filtros aplicados.',
  }
}
