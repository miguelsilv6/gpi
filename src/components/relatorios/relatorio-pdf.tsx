import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { RelatorioResult } from '@/lib/relatorios/types'
import { fmtDateTime } from '@/lib/relatorios/shared'

/**
 * Documento PDF para qualquer `RelatorioResult`. Layout A4 portrait, fonte
 * Helvetica built-in (sem dependências de fonte externa → sem CDN issues
 * no contentor).
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 50,
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1f2937',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  headerMeta: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
    marginTop: 6,
    marginBottom: 4,
  },
  filtrosBlock: {
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filtroChip: {
    backgroundColor: '#ffffff',
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    fontSize: 8,
    color: '#374151',
  },
  summaryBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  summaryItem: {
    backgroundColor: '#eff6ff',
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 6,
    fontSize: 9,
    color: '#1e40af',
  },
  table: {
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderBottomWidth: 1,
    borderBottomColor: '#9ca3af',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableHeaderCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#111827',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRowAlt: {
    backgroundColor: '#f9fafb',
  },
  tableTotalRow: {
    backgroundColor: '#fef3c7',
    borderTopWidth: 1,
    borderTopColor: '#d97706',
    fontFamily: 'Helvetica-Bold',
  },
  tableCell: {
    fontSize: 8,
    paddingRight: 4,
  },
  tableCellRight: {
    textAlign: 'right',
  },
  emptyState: {
    paddingVertical: 30,
    textAlign: 'center',
    color: '#6b7280',
    fontStyle: 'italic',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7,
    color: '#9ca3af',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
})

export interface RelatorioPDFBrand {
  appName: string
  appShortName: string
  pdfFooterText: string
}

export function RelatorioPDF({
  data,
  brand,
}: {
  data: RelatorioResult
  brand: RelatorioPDFBrand
}) {
  const filtros = Object.entries(data.filtros).filter(([, v]) => v)
  const numCols = data.columns.length
  const colWidth = `${100 / numCols}%`

  return (
    <Document
      title={data.title}
      author={data.geradoPor}
      creator={brand.appName}
      producer={brand.appName}
    >
      <Page size="A4" style={styles.page} wrap>
        <View>
          <Text style={styles.headerTitle}>{data.title}</Text>
          <Text style={styles.headerMeta}>
            Gerado em {fmtDateTime(data.geradoEm)} por {data.geradoPor}
          </Text>
        </View>

        {filtros.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>Filtros aplicados</Text>
            <View style={styles.filtrosBlock}>
              {filtros.map(([k, v]) => (
                <Text key={k} style={styles.filtroChip}>
                  {k}: {v}
                </Text>
              ))}
            </View>
          </View>
        )}

        {data.summary && data.summary.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>Sumário</Text>
            <View style={styles.summaryBlock}>
              {data.summary.map((s) => (
                <Text key={s.label} style={styles.summaryItem}>
                  {s.label}: {s.value}
                </Text>
              ))}
            </View>
          </View>
        )}

        {data.rows.length === 0 ? (
          <Text style={styles.emptyState}>{data.emptyMessage ?? 'Sem dados para apresentar.'}</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeader} fixed>
              {data.columns.map((c) => (
                <Text
                  key={c.key}
                  style={[
                    styles.tableHeaderCell,
                    { width: colWidth },
                    c.align === 'right' ? styles.tableCellRight : {},
                  ]}
                >
                  {c.label}
                </Text>
              ))}
            </View>
            {data.rows.map((row, idx) => {
              const isTotal = row[data.columns[0].key] === 'Total'
              return (
                <View
                  key={idx}
                  style={[
                    styles.tableRow,
                    idx % 2 === 1 ? styles.tableRowAlt : {},
                    isTotal ? styles.tableTotalRow : {},
                  ]}
                  wrap={false}
                >
                  {data.columns.map((c) => {
                    const v = row[c.key]
                    return (
                      <Text
                        key={c.key}
                        style={[
                          styles.tableCell,
                          { width: colWidth },
                          c.align === 'right' ? styles.tableCellRight : {},
                        ]}
                      >
                        {v === null || v === undefined ? '' : String(v)}
                      </Text>
                    )
                  })}
                </View>
              )
            })}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{brand.pdfFooterText}</Text>
          <Text
            render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}
