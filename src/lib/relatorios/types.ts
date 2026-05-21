import type { Role } from '@/generated/prisma/enums'
import type { LucideIcon } from 'lucide-react'

/**
 * Tipos partilhados pela infraestrutura de Relatórios.
 *
 * Um relatório é uma função pura `(filters, session) → RelatorioResult`. O
 * resultado tem um shape canónico (colunas + linhas + sumário) que cada
 * formato de export (CSV, Markdown, PDF) consome sem precisar de saber qual
 * é o relatório. Adicionar um relatório novo é registar uma entrada em
 * `RELATORIOS` (em `./index.ts`); os endpoints e UI ficam intocados.
 */

export type RelatorioCellValue = string | number | null

export type RelatorioRow = Record<string, RelatorioCellValue>

export interface RelatorioColumn {
  /** Chave da coluna; tem que existir em cada `RelatorioRow`. */
  key: string
  /** Label apresentado no cabeçalho (CSV/MD/PDF). */
  label: string
  /** Alinhamento para o PDF e a pré-visualização. Default: 'left'. */
  align?: 'left' | 'right'
}

export interface RelatorioSummaryItem {
  label: string
  value: string | number
}

export interface RelatorioResult {
  /** Título humano (usado no cabeçalho do PDF/Markdown). */
  title: string
  /** Quando o relatório foi gerado. */
  geradoEm: Date
  /** Nome do utilizador que pediu o relatório. */
  geradoPor: string
  /**
   * Filtros aplicados, em forma plana key→string|null, para impressão.
   * Não inclui valores PII — apenas metadados de filtragem (datas, ids).
   */
  filtros: Record<string, string | null>
  columns: RelatorioColumn[]
  rows: RelatorioRow[]
  /** Indicadores no topo da pré-visualização (ex: "Total: 42"). */
  summary?: RelatorioSummaryItem[]
  /** Mensagem informativa quando rows está vazio. */
  emptyMessage?: string
}

export interface RelatorioSession {
  id: string
  nome: string
  role: Role
  brigadaId: string | null
}

export type RelatorioHandler = (
  filters: URLSearchParams,
  session: RelatorioSession,
) => Promise<RelatorioResult>

export interface RelatorioDefinition {
  id: string
  titulo: string
  descricao: string
  icon: LucideIcon
  handler: RelatorioHandler
}

/**
 * Limite de linhas por relatório. Acima disto o handler deve devolver um
 * erro com mensagem "Refine os filtros". Equivalente ao limite 5000 em
 * /api/inqueritos/export.
 */
export const RELATORIO_ROW_LIMIT = 10000
