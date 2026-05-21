import type { RelatorioResult } from './types'
import { fmtDateTime } from './shared'

/**
 * Formatadores CSV / Markdown para um `RelatorioResult`. O formatador PDF
 * vive em `src/components/relatorios/relatorio-pdf.tsx` porque depende de
 * `@react-pdf/renderer` (componente React).
 */

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCSV(data: RelatorioResult): string {
  // Cabeçalho de metadados em comentário (Excel-friendly: o BOM cuida do UTF-8).
  const meta = [
    `# ${data.title}`,
    `# Gerado em ${fmtDateTime(data.geradoEm)} por ${data.geradoPor}`,
    ...Object.entries(data.filtros)
      .filter(([, v]) => v)
      .map(([k, v]) => `# Filtro: ${k} = ${v}`),
    '',
  ].join('\n')

  if (data.rows.length === 0) {
    return (
      meta +
      data.columns.map((c) => escapeCSV(c.label)).join(',') +
      '\n' +
      (data.emptyMessage ?? 'Sem dados') +
      '\n'
    )
  }

  const header = data.columns.map((c) => escapeCSV(c.label)).join(',')
  const lines = data.rows.map((row) =>
    data.columns.map((c) => escapeCSV(row[c.key])).join(','),
  )
  return meta + header + '\n' + lines.join('\n') + '\n'
}

export function toMarkdown(data: RelatorioResult): string {
  const filtros = Object.entries(data.filtros).filter(([, v]) => v)

  const out: string[] = []
  // Frontmatter YAML — útil para colar em Notion / pandoc.
  out.push('---')
  out.push(`titulo: "${data.title.replace(/"/g, '\\"')}"`)
  out.push(`gerado_em: "${fmtDateTime(data.geradoEm)}"`)
  out.push(`gerado_por: "${data.geradoPor.replace(/"/g, '\\"')}"`)
  out.push('---')
  out.push('')
  out.push(`# ${data.title}`)
  out.push('')
  out.push(`Gerado em **${fmtDateTime(data.geradoEm)}** por **${data.geradoPor}**.`)
  if (filtros.length > 0) {
    out.push('')
    out.push('**Filtros aplicados:**')
    out.push('')
    for (const [k, v] of filtros) {
      out.push(`- ${k}: ${v}`)
    }
  }
  if (data.summary && data.summary.length > 0) {
    out.push('')
    out.push('**Sumário:**')
    out.push('')
    for (const s of data.summary) {
      out.push(`- ${s.label}: **${s.value}**`)
    }
  }
  out.push('')

  if (data.rows.length === 0) {
    out.push(`_${data.emptyMessage ?? 'Sem dados.'}_`)
    out.push('')
    return out.join('\n')
  }

  // Tabela GitHub-flavoured.
  out.push('| ' + data.columns.map((c) => c.label).join(' | ') + ' |')
  out.push(
    '| ' +
      data.columns.map((c) => (c.align === 'right' ? '---:' : '---')).join(' | ') +
      ' |',
  )
  for (const row of data.rows) {
    out.push(
      '| ' +
        data.columns
          .map((c) => {
            const v = row[c.key]
            if (v === null || v === undefined) return ''
            return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ')
          })
          .join(' | ') +
        ' |',
    )
  }
  out.push('')
  return out.join('\n')
}

/** Prefixo BOM (Excel UTF-8) — usar antes de escrever CSV. */
export const UTF8_BOM = '﻿'
