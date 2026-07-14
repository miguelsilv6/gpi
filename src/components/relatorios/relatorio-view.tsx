'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Download, FileText, FileType, ArrowLeft } from 'lucide-react'
import {
  type Catalogo,
  InqueritosFilters,
  BrigadasFilters,
  InspetoresFilters,
  InatividadeFilters,
  IntercecoesFilters,
  ApreensoesFilters,
  PericiasFilters,
} from './relatorio-filters'

interface ApiRelatorioResult {
  title: string
  geradoEm: string
  geradoPor: string
  filtros: Record<string, string | null>
  columns: { key: string; label: string; align?: 'left' | 'right' }[]
  rows: Record<string, string | number | null>[]
  summary?: { label: string; value: string | number }[]
  emptyMessage?: string
}

interface RelatorioViewProps {
  id: string
  titulo: string
  descricao: string
  lockedBrigadaId: string | null
  catalogo: Catalogo
}

const PREVIEW_VISUAL_LIMIT = 200

/** Constrói a query string a partir do objecto de filtros, ignorando vazios. */
function toQuery(filters: Record<string, string>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v)
  }
  return params.toString()
}

export function RelatorioView({
  id,
  titulo,
  descricao,
  lockedBrigadaId,
  catalogo,
}: RelatorioViewProps) {
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [data, setData] = useState<ApiRelatorioResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  // Fetch da pré-visualização com debounce (300ms).
  const query = useMemo(() => toQuery(filters), [filters])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const url = `/api/relatorios/${id}?format=preview${query ? '&' + query : ''}`
        const res = await fetch(url)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        const json = (await res.json()) as ApiRelatorioResult
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro desconhecido')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [id, query])

  const exportUrl = (format: 'csv' | 'md' | 'pdf') =>
    `/api/relatorios/${id}?format=${format}${query ? '&' + query : ''}`

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
          <p className="text-muted-foreground text-sm">{descricao}</p>
        </div>
        <Link
          href="/relatorios"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          {id === 'inqueritos' && (
            <InqueritosFilters
              filters={filters}
              setFilter={setFilter}
              catalogo={catalogo}
              lockedBrigadaId={lockedBrigadaId}
            />
          )}
          {id === 'brigadas' && (
            <BrigadasFilters
              filters={filters}
              setFilter={setFilter}
              catalogo={catalogo}
              lockedBrigadaId={lockedBrigadaId}
            />
          )}
          {id === 'inspetores' && (
            <InspetoresFilters
              filters={filters}
              setFilter={setFilter}
              catalogo={catalogo}
              lockedBrigadaId={lockedBrigadaId}
            />
          )}
          {id === 'inatividade' && (
            <InatividadeFilters
              filters={filters}
              setFilter={setFilter}
              catalogo={catalogo}
              lockedBrigadaId={lockedBrigadaId}
            />
          )}
          {id === 'intercecoes' && (
            <IntercecoesFilters
              filters={filters}
              setFilter={setFilter}
              catalogo={catalogo}
              lockedBrigadaId={lockedBrigadaId}
            />
          )}
          {id === 'apreensoes' && (
            <ApreensoesFilters
              filters={filters}
              setFilter={setFilter}
              catalogo={catalogo}
              lockedBrigadaId={lockedBrigadaId}
            />
          )}
          {id === 'pericias' && (
            <PericiasFilters
              filters={filters}
              setFilter={setFilter}
              catalogo={catalogo}
              lockedBrigadaId={lockedBrigadaId}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-sm">Pré-visualização</CardTitle>
            {data && (
              <p className="text-xs text-muted-foreground mt-1">
                {data.rows.length} {data.rows.length === 1 ? 'linha' : 'linhas'} ·
                Gerado em {new Date(data.geradoEm).toLocaleString('pt-PT')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={exportUrl('csv')}
              className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
            >
              <Download className="h-4 w-4 mr-1" />
              CSV
            </a>
            <a
              href={exportUrl('md')}
              className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
            >
              <FileText className="h-4 w-4 mr-1" />
              Markdown
            </a>
            <a
              href={exportUrl('pdf')}
              className={cn(buttonVariants({ size: 'sm' }))}
            >
              <FileType className="h-4 w-4 mr-1" />
              PDF
            </a>
          </div>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="py-4 text-sm text-muted-foreground">A carregar…</p>
          )}
          {error && (
            <p className="py-4 text-sm text-destructive">Erro: {error}</p>
          )}
          {!loading && !error && data && (
            <PreviewTable data={data} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PreviewTable({ data }: { data: ApiRelatorioResult }) {
  const visibleRows = data.rows.slice(0, PREVIEW_VISUAL_LIMIT)
  const hiddenCount = data.rows.length - visibleRows.length

  return (
    <div className="space-y-3">
      {data.summary && data.summary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.summary.map((s) => (
            <Badge key={s.label} variant="outline" className="text-xs">
              <span className="text-muted-foreground mr-1">{s.label}:</span>
              <span className="font-semibold">{s.value}</span>
            </Badge>
          ))}
        </div>
      )}

      {data.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground italic">
          {data.emptyMessage ?? 'Sem dados.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                {data.columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      'px-2 py-1.5 text-left font-medium text-xs',
                      c.align === 'right' && 'text-right',
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => {
                const isTotal = row[data.columns[0].key] === 'Total'
                return (
                  <tr
                    key={idx}
                    className={cn(
                      'border-b',
                      idx % 2 === 1 && !isTotal && 'bg-muted/20',
                      isTotal && 'bg-amber-50 font-semibold',
                    )}
                  >
                    {data.columns.map((c) => {
                      const v = row[c.key]
                      return (
                        <td
                          key={c.key}
                          className={cn(
                            'px-2 py-1.5',
                            c.align === 'right' && 'text-right tabular-nums',
                          )}
                        >
                          {v === null || v === undefined ? '' : String(v)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {hiddenCount > 0 && (
        <p className="text-xs text-muted-foreground italic">
          + {hiddenCount} linhas adicionais — a exportação inclui todas.
        </p>
      )}
    </div>
  )
}
