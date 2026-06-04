'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plane, Coffee, Trash2, Pencil } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { FeriasCalendar } from './ferias-calendar'
import { FeriasBrigadaOverview } from './ferias-brigada-overview'
import type { Ausencia, MembroFerias, Totais, TipoAusencia, GanttScale } from './types'
import { TIPO_LABEL, TIPO_COR } from './types'

interface Props {
  canViewBrigade: boolean
  canViewAll?: boolean
  userBrigadaId?: string | null
  brigadas?: { id: string; nome: string }[]
}

export function FeriasView({ canViewBrigade, canViewAll = false, userBrigadaId, brigadas = [] }: Props) {
  const [month, setMonth] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const ano = month.getFullYear()

  const [tab, setTab] = useState<'me' | 'brigade'>('me')
  const [ausencias, setAusencias] = useState<Ausencia[]>([])
  const [totais, setTotais] = useState<Totais>({ ferias: 0, folga: 0, total: 0 })
  const [membros, setMembros] = useState<MembroFerias[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // For canViewAll roles (COORDENADOR/ADMINISTRACAO) without their own brigade,
  // default to the first available brigade so the overview loads immediately.
  const [selectedBrigadaId, setSelectedBrigadaId] = useState<string | null>(
    userBrigadaId ?? brigadas[0]?.id ?? null,
  )

  const [ganttScale, setGanttScale] = useState<GanttScale>('month')

  const [editing, setEditing] = useState<Ausencia | null>(null)
  const [deleting, setDeleting] = useState<Ausencia | null>(null)

  const fetchSelf = useCallback(async (y: number, signal?: AbortSignal) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ferias?ano=${y}`, { signal })
      if (res.ok) {
        const data = await res.json()
        setAusencias(data.ausencias)
        setTotais(data.totais)
      } else {
        toast.error('Erro ao carregar marcações')
      }
      setLoading(false)
    } catch (e) {
      // A superseded request was aborted — a newer fetch is already in flight.
      if ((e as Error).name === 'AbortError') return
      toast.error('Erro ao carregar marcações')
      setLoading(false)
    }
  }, [])

  const fetchBrigade = useCallback(async (y: number, brigadaId: string | null, signal?: AbortSignal) => {
    if (!brigadaId) return
    const params = new URLSearchParams({ ano: String(y), scope: 'brigade', brigadaId })
    try {
      const res = await fetch(`/api/ferias?${params}`, { signal })
      if (res.ok) {
        const data = await res.json()
        setMembros(data.membros)
      } else {
        toast.error('Erro ao carregar a visão de brigada')
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      toast.error('Erro ao carregar a visão de brigada')
    }
  }, [])

  // Refetch whenever the year or selected brigade changes. The AbortController
  // cancels superseded requests so a slow earlier response can't overwrite the
  // data for a newer year/brigade selection.
  useEffect(() => {
    const controller = new AbortController()
    fetchSelf(ano, controller.signal)
    if (canViewBrigade) fetchBrigade(ano, selectedBrigadaId, controller.signal)
    return () => controller.abort()
  }, [ano, canViewBrigade, selectedBrigadaId, fetchSelf, fetchBrigade])

  async function refresh() {
    await fetchSelf(ano)
    if (canViewBrigade) await fetchBrigade(ano, selectedBrigadaId)
  }

  async function handleCreate(payload: {
    tipo: TipoAusencia; dataInicio: string; dataFim: string; nota: string | null
  }) {
    setBusy(true)
    try {
      const res = await fetch('/api/ferias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao marcar')
        return
      }
      toast.success(`${TIPO_LABEL[payload.tipo]} marcada`)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdate() {
    if (!editing) return
    setBusy(true)
    try {
      const res = await fetch(`/api/ferias/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: editing.tipo,
          dataInicio: editing.dataInicio.slice(0, 10),
          dataFim: editing.dataFim.slice(0, 10),
          nota: editing.nota,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success('Marcação atualizada')
      setEditing(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      const res = await fetch(`/api/ferias/${deleting.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao apagar')
        return
      }
      toast.success('Marcação apagada')
      setDeleting(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const meContent = (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <CounterCard
            icon={<Plane className="h-4 w-4 text-blue-500" />}
            label="Férias"
            value={totais.ferias}
            valueClass="text-blue-700 dark:text-blue-400"
          />
          <CounterCard
            icon={<Coffee className="h-4 w-4 text-amber-500" />}
            label="Folgas"
            value={totais.folga}
            valueClass="text-amber-700 dark:text-amber-400"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Dias úteis marcados em {ano} (exclui fins de semana e feriados).
        </p>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Marcações de {ano}</CardTitle>
          </CardHeader>
          <CardContent>
            {ausencias.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Sem marcações este ano.</p>
            ) : (
              <ul className="divide-y">
                {ausencias.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TIPO_COR[a.tipo].badge}`}>
                        {TIPO_LABEL[a.tipo]}
                      </span>
                      <span className="text-sm tabular-nums truncate">
                        {a.dataInicio.slice(0, 10)} → {a.dataFim.slice(0, 10)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditing(a)} aria-label="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(a)} aria-label="Apagar">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Marcar período</CardTitle>
        </CardHeader>
        <CardContent>
          <FeriasCalendar
            ausencias={ausencias}
            month={month}
            onMonthChange={setMonth}
            onCreate={handleCreate}
            busy={busy}
          />
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Férias</h1>
        <p className="text-muted-foreground text-sm">Marca os teus períodos de férias e folgas.</p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">A carregar…</div>
      ) : canViewBrigade ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'me' | 'brigade')}>
          <TabsList>
            <TabsTrigger value="me">As minhas marcações</TabsTrigger>
            <TabsTrigger value="brigade">Brigada</TabsTrigger>
          </TabsList>
          <TabsContent value="me" className="mt-4">{meContent}</TabsContent>
          <TabsContent value="brigade" className="mt-4">
            {canViewAll && brigadas.length > 0 && (
              <div className="mb-4 flex items-center gap-2">
                <Label className="text-sm text-muted-foreground shrink-0">Brigada:</Label>
                <Select
                  value={selectedBrigadaId ?? ''}
                  onValueChange={(v) => setSelectedBrigadaId(v || null)}
                >
                  <SelectTrigger className="w-56">
                    <span className="flex-1 truncate text-left">
                      {selectedBrigadaId
                        ? brigadas.find((b) => b.id === selectedBrigadaId)?.nome ?? ''
                        : <span className="text-muted-foreground">Selecionar brigada…</span>}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {brigadas.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <FeriasBrigadaOverview membros={membros} month={month} onMonthChange={setMonth} scale={ganttScale} onScaleChange={setGanttScale} />
          </TabsContent>
        </Tabs>
      ) : (
        meContent
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !busy && !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Editar marcação</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tipo</Label>
                <Select
                  value={editing.tipo}
                  onValueChange={(v) => setEditing({ ...editing, tipo: v as TipoAusencia })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FERIAS">Férias</SelectItem>
                    <SelectItem value="FOLGA">Folga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Início</Label>
                  <Input
                    type="date"
                    value={editing.dataInicio.slice(0, 10)}
                    onChange={(e) => setEditing({ ...editing, dataInicio: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Fim</Label>
                  <Input
                    type="date"
                    value={editing.dataFim.slice(0, 10)}
                    onChange={(e) => setEditing({ ...editing, dataFim: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nota (opcional)</Label>
                <Textarea
                  rows={2}
                  value={editing.nota ?? ''}
                  onChange={(e) => setEditing({ ...editing, nota: e.target.value || null })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={busy}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleting} onOpenChange={(o) => !busy && !o && setDeleting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apagar marcação</DialogTitle>
            <DialogDescription>
              {deleting && (
                <>
                  {TIPO_LABEL[deleting.tipo]} de {deleting.dataInicio.slice(0, 10)} a{' '}
                  {deleting.dataFim.slice(0, 10)} será removida.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={busy}>Apagar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CounterCard({
  icon, label, value, valueClass,
}: { icon: React.ReactNode; label: string; value: number; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <p className={`text-3xl font-bold mt-1 ${valueClass ?? ''}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
