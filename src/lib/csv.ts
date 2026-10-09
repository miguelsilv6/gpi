import { format } from 'date-fns'
import { UTF8_BOM } from '@/lib/relatorios/formatters'

/** Limite de linhas por exportação (igual ao export de inquéritos). */
export const CSV_EXPORT_LIMIT = 5000

/**
 * Escapa um valor para CSV. Valores começados por `= + - @` (ou tab/CR) são
 * prefixados com `'` para o Excel/LibreOffice não os interpretar como
 * fórmulas (CSV injection) — os dados vêm de campos livres preenchidos por
 * utilizadores.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let str = value instanceof Date ? format(value, 'dd/MM/yyyy') : String(value)
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

/** Constrói o corpo CSV (com BOM, para o Excel abrir em UTF-8). */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  return UTF8_BOM + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

/** Resposta de download CSV com nome `<prefixo>-AAAA-MM-DD.csv`. */
export function csvResponse(prefixo: string, csv: string): Response {
  const data = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${prefixo}-${data}.csv"`,
    },
  })
}
