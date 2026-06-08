'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatDateTime } from '@/lib/utils'
import {
  SEVERIDADE_LABELS,
  SEVERIDADE_VALUES,
  SEVERIDADE_COLORS,
  ESTADO_LABELS,
  ESTADO_VALUES,
  ESTADO_COLORS,
} from '@/lib/bugreport-labels'
import type { SeveridadeBug, EstadoBug } from '@/generated/prisma/enums'
import { ChevronDown, Trash2 } from 'lucide-react'

interface BugReportRow {
  id: string
  titulo: string
  descricao: string
  severidade: SeveridadeBug
  estado: EstadoBug
  pagina: string | null
  notaAdmin: string | null
  createdAt: string
  criadoPor: { id: string; nome: string; email: string } | null
}

interface Props {
  initialItems: BugReportRow[]
  initialCursor: string | null
  counts: Record<string, number>
}

export function BugReportsAdmin({ initialItems, initialCursor, counts }: Props) {
  const [items, setItems] = useState<BugReportRow[]>(initialItems)
  const [cursor, setCursor] = useState<string | null>(initialCursor)
  const [loading, setLoading] = useState(false)
  const [filtro, setFiltro] = useState<EstadoBug | 'all'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load(reset: boolean, estado: EstadoBug | 'all') {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (estado !== 'all') params.set('estado', estado)
      if (!reset && cursor) params.set('cursor', cursor)
      const res = await fetch(`/api/bug-reports?${params.toString()}`)
      if (!res.ok) throw new Error('Erro na resposta do servidor')
      const data = await res.json()
      setItems((prev) => (reset ? data.items : [...prev, ...data.items]))
      setCursor(data.nextCursor)
    } catch {
      toast.error('Erro ao carregar reports')
    } finally {
      setLoading(false)
    }
  }

  function applyFiltro(estado: EstadoBug | 'all') {
    setFiltro(estado)
    setCursor(null)
    void load(true, estado)
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestão de Bugs</h1>
        <p className="text-muted-foreground text-sm">
          {total} report{total !== 1 ? 's' : ''} no total — centralizados para análise.
        </p>
      </div>

      {/* Filtros por estado */}
      <div className="flex flex-wrap gap-1.5">
        <FiltroChip label={`Todos (${total})`} active={filtro === 'all'} onClick={() => applyFiltro('all')} />
        {ESTADO_VALUES.map((e) => (
          <FiltroChip
            key={e}
            label={`${ESTADO_LABELS[e]} (${counts[e] ?? 0})`}
            active={filtro === e}
            onClick={() => applyFiltro(e)}
          />
        ))}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sem reports {filtro !== 'all' ? `no estado "${ESTADO_LABELS[filtro]}"` : ''}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <BugReportCard
              key={r.id}
              report={r}
              expanded={expanded === r.id}
              onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
              onUpdated={(updated) =>
                setItems((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))
              }
              onDeleted={(id) => setItems((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => load(false, filtro)} disabled={loading}>
            {loading ? 'A carregar...' : 'Carregar mais'}
          </Button>
        </div>
      )}
    </div>
  )
}

function FiltroChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted',
      )}
    >
      {label}
    </button>
  )
}

function BugReportCard({
  report,
  expanded,
  onToggle,
  onUpdated,
  onDeleted,
}: {
  report: BugReportRow
  expanded: boolean
  onToggle: () => void
  onUpdated: (r: Partial<BugReportRow> & { id: string }) => void
  onDeleted: (id: string) => void
}) {
  const [estado, setEstado] = useState<EstadoBug>(report.estado)
  const [severidade, setSeveridade] = useState<SeveridadeBug>(report.severidade)
  const [nota, setNota] = useState(report.notaAdmin ?? '')
  const [saving, setSaving] = useState(false)

  // Sincroniza o estado local quando os valores guardados do report mudam (ex:
  // recarga/filtragem no componente pai), evitando UI desatualizada.
  useEffect(() => {
    setEstado(report.estado)
    setSeveridade(report.severidade)
    setNota(report.notaAdmin ?? '')
  }, [report.estado, report.severidade, report.notaAdmin])

  const dirty =
    estado !== report.estado || severidade !== report.severidade || (nota.trim() || null) !== (report.notaAdmin ?? null)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/bug-reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado, severidade, notaAdmin: nota.trim() || null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      onUpdated({ id: report.id, estado, severidade, notaAdmin: nota.trim() || null })
      toast.success('Report atualizado')
    } catch {
      toast.error('Erro ao guardar')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm('Eliminar definitivamente este report?')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/bug-reports/${report.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        toast.error('Erro ao eliminar')
        return
      }
      onDeleted(report.id)
      toast.success('Report eliminado')
    } catch {
      toast.error('Erro ao eliminar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/30 transition-colors rounded-xl"
      >
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{report.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {report.criadoPor?.nome ?? '—'} · {formatDateTime(report.createdAt)}
          </p>
        </div>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', SEVERIDADE_COLORS[report.severidade])}>
          {SEVERIDADE_LABELS[report.severidade]}
        </span>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', ESTADO_COLORS[report.estado])}>
          {ESTADO_LABELS[report.estado]}
        </span>
      </button>

      {expanded && (
        <div className="border-t p-4 space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Descrição</p>
            <p className="text-sm whitespace-pre-wrap">{report.descricao}</p>
          </div>

          {report.pagina && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Página/contexto</p>
              <p className="text-sm font-mono">{report.pagina}</p>
            </div>
          )}

          {report.criadoPor && (
            <p className="text-xs text-muted-foreground">
              Reportado por {report.criadoPor.nome} ({report.criadoPor.email})
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={(v) => setEstado(v as EstadoBug)}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue>{(v: string) => ESTADO_LABELS[v as EstadoBug] ?? '—'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ESTADO_VALUES.map((e) => (
                    <SelectItem key={e} value={e}>{ESTADO_LABELS[e]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Severidade</Label>
              <Select value={severidade} onValueChange={(v) => setSeveridade(v as SeveridadeBug)}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue>{(v: string) => SEVERIDADE_LABELS[v as SeveridadeBug] ?? '—'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SEVERIDADE_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>{SEVERIDADE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`nota-${report.id}`}>Nota interna / resposta</Label>
            <Textarea
              id={`nota-${report.id}`}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Notas de triagem, resolução ou resposta ao utilizador..."
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={saving}
              className="text-red-600 hover:text-red-700 gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty || saving}>
              {saving ? 'A guardar...' : 'Guardar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
