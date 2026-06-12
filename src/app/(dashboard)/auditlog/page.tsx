'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, ClipboardList } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { acaoColor, acaoLabel } from '@/components/audit/audit-labels'
import {
  AuditDetailDialog,
  type AuditEntryFull,
} from '@/components/audit/audit-detail-dialog'

const ENTIDADES = [
  'Inquerito',
  'Utilizador',
  'Brigada',
  'Configuracao',
  'Atividade',
  'Controlo',
  'Documento',
  'NotificationPolicy',
  'Relatorio',
  'Backup',
]

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditEntryFull[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [entidadeFilter, setEntidadeFilter] = useState('')
  const [selected, setSelected] = useState<AuditEntryFull | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function fetchLogs(cursor?: string, replace = false) {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    if (entidadeFilter) params.set('entidade', entidadeFilter)

    try {
      const res = await fetch(`/api/auditlog?${params.toString()}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setLogs((prev) => (replace ? data.items : [...prev, ...data.items]))
      setNextCursor(data.nextCursor)
    } catch {
      toast.error('Erro ao carregar audit log')
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchLogs(undefined, true).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadeFilter])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    await fetchLogs(nextCursor)
    setLoadingMore(false)
  }

  function openDetails(entry: AuditEntryFull) {
    setSelected(entry)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground text-sm">
          Registo de todas as ações do sistema. Clica numa linha para ver os detalhes.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={entidadeFilter || 'all'}
          onValueChange={(v) => setEntidadeFilter(!v || v === 'all' ? '' : v)}
        >
          <SelectTrigger className="h-9 w-[200px] text-sm">
            <SelectValue placeholder="Todas as entidades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as entidades</SelectItem>
            {ENTIDADES.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ClipboardList className="h-8 w-8 mb-3 opacity-40" />
          <p className="text-sm">Nenhum registo encontrado</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Data
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Utilizador
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Ação
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Entidade
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    ID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => openDetails(log)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openDetails(log)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    className="hover:bg-accent/40 active:bg-accent/60 cursor-pointer transition-colors focus:outline-none focus:bg-accent/40 focus:ring-2 focus:ring-ring/40 focus:ring-inset"
                  >
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                      {formatDateTime(new Date(log.createdAt))}
                    </td>
                    <td className="px-4 py-3 font-medium">{log.utilizadorNome}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${acaoColor(log.acao)}`}
                        title={acaoLabel(log.acao)}
                      >
                        {log.acao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {log.entidade}
                      {log.entidadeNuipc && (
                        <span className="ml-2 font-mono text-xs">{log.entidadeNuipc}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[120px]">
                      {log.entidadeId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {logs.map((log) => (
              <button
                key={log.id}
                type="button"
                onClick={() => openDetails(log)}
                className="block w-full text-left rounded-xl border bg-card p-4 space-y-2 hover:bg-accent/40 transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${acaoColor(log.acao)}`}
                  >
                    {log.acao}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(new Date(log.createdAt))}
                  </span>
                </div>
                <p className="font-medium text-sm">{log.utilizadorNome}</p>
                <p className="text-xs text-muted-foreground">
                  {log.entidade} ·{' '}
                  <span className="font-mono">
                    {log.entidadeNuipc ?? log.entidadeId}
                  </span>
                </p>
              </button>
            ))}
          </div>

          {nextCursor && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}

      <AuditDetailDialog
        entry={selected}
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v)
          if (!v) setSelected(null)
        }}
      />
    </div>
  )
}
