'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { acaoLabel } from '@/components/audit/audit-labels'
import { DiffRenderer } from '@/components/audit/diff-renderer'

interface AuditEntry {
  id: string
  acao: string
  utilizadorId: string
  utilizadorNome: string | null
  detalhes: Record<string, unknown> | null
  ip: string | null
  createdAt: string
}

/**
 * Histórico de alterações no contexto de UM inquérito. Renderiza
 * lista cronológica com expand/colapso para detalhes JSON. Para a
 * vista global cross-entity, ver `/auditlog` + `AuditDetailDialog`.
 */
export function AuditHistory({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open || loaded) return
    setLoading(true)
    fetch(`/api/inqueritos/${slug}/audit?limit=50`)
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err.error ?? 'Erro a carregar histórico')
        }
        return r.json()
      })
      .then((d) => setEntries(d.data ?? []))
      .catch((e) => setError(e.message))
      .finally(() => {
        setLoading(false)
        setLoaded(true)
      })
  }, [open, loaded, slug])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Histórico de alterações
          </CardTitle>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CardHeader>
      {open && (
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">
              Sem entradas de auditoria.
            </p>
          ) : (
            <ol className="space-y-3">
              {entries.map((e) => {
                const isExpanded = expanded.has(e.id)
                const hasDetails = e.detalhes && Object.keys(e.detalhes).length > 0
                return (
                  <li key={e.id} className="border-l-2 border-muted pl-3 text-sm">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <span className="font-medium">{acaoLabel(e.acao)}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(new Date(e.createdAt))}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      por{' '}
                      <span className="font-medium text-foreground">
                        {e.utilizadorNome ?? '—'}
                      </span>
                      {e.ip && <span className="ml-2 font-mono">({e.ip})</span>}
                    </div>
                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(e.id)}
                        className="text-xs text-muted-foreground hover:text-foreground mt-1 underline underline-offset-2"
                      >
                        {isExpanded ? 'Esconder detalhes' : 'Ver detalhes'}
                      </button>
                    )}
                    {isExpanded && hasDetails && (
                      <div className="mt-2 rounded-md bg-muted/40 p-2.5">
                        <DiffRenderer detalhes={e.detalhes} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
          {loaded && !loading && entries.length === 50 && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              A mostrar últimas 50 entradas.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
