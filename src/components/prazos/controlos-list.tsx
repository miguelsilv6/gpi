'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { CalendarCheck, Loader2, AlertTriangle, Bell, Clock, CheckCircle2, Pencil, Trash2, Flag, RotateCcw, History } from 'lucide-react'
import { toast } from 'sonner'
import { cn, nuipcToSlug, formatDate, formatDateTime } from '@/lib/utils'
import { acaoLabel } from '@/components/audit/audit-labels'
import { DiffRenderer } from '@/components/audit/diff-renderer'
import Link from 'next/link'
import type { ControloItem, ControloRealizacaoItem } from '@/lib/controlos'
import {
  nextRealizacao,
  countConfirmadas,
  urgencyControlo,
  ordinalControlo,
} from '@/lib/controlos'
import type { Urgency } from '@/lib/prazos'
import { diasRestantes } from '@/lib/prazos'

interface Props {
  items: ControloItem[]
  total?: number
  showCriador: boolean
  showBrigada: boolean
  emptyMessage?: string
}

export function ControlosList({
  items,
  total,
  showCriador,
  showBrigada,
  emptyMessage = 'Sem controlos pendentes.',
}: Props) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descrição</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Inquérito</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Próximo controlo</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data esperada</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Urgência</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Progresso</th>
              {showCriador && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Criador</th>
              )}
              {showBrigada && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Brigada</th>
              )}
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((c) => {
              const next = nextRealizacao(c.realizacoes)
              const confirmed = countConfirmadas(c.realizacoes)
              const urgency = urgencyControlo(c, next)
              return (
                <tr key={c.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="line-clamp-2 font-medium">{c.descricao}</p>
                    {c.periodoDias && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        A cada {c.periodoDias} dias
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.inquerito ? (
                      <Link
                        href={`/inqueritos/${nuipcToSlug(c.inquerito.nuipc)}`}
                        className="font-mono font-medium hover:text-blue-600 hover:underline text-sm"
                      >
                        {c.inquerito.nuipc}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {next ? (
                      <span className="text-sm">{ordinalControlo(next.numero)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Concluído
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {next ? formatDate(next.dataEsperada) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ControloUrgencyBadge urgency={urgency} next={next} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {confirmed} confirmado{confirmed !== 1 ? 's' : ''}
                  </td>
                  {showCriador && (
                    <td className="px-4 py-3 text-muted-foreground text-sm">
                      {c.criador.nome}
                    </td>
                  )}
                  {showBrigada && (
                    <td className="px-4 py-3 text-muted-foreground text-sm">
                      {c.inquerito?.brigada?.nome ?? '—'}
                    </td>
                  )}
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {next && !c.concluidoEm && (
                        <ConfirmButton controloId={c.id} realizacao={next} />
                      )}
                      {!c.concluidoEm && (
                        <ConcluirButton controloId={c.id} descricao={c.descricao} />
                      )}
                      <HistoryButton controloId={c.id} descricao={c.descricao} />
                      <EditButton controlo={c} />
                      <DeleteButton controloId={c.id} descricao={c.descricao} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {items.map((c) => {
          const next = nextRealizacao(c.realizacoes)
          const confirmed = countConfirmadas(c.realizacoes)
          const urgency = urgencyControlo(c, next)
          return (
            <Card key={c.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm line-clamp-2">{c.descricao}</p>
                    {c.periodoDias && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        A cada {c.periodoDias} dias
                      </p>
                    )}
                    {c.inquerito && (
                      <Link
                        href={`/inqueritos/${nuipcToSlug(c.inquerito.nuipc)}`}
                        className="font-mono text-xs font-medium text-blue-600 hover:underline mt-1 block"
                      >
                        {c.inquerito.nuipc}
                      </Link>
                    )}
                  </div>
                  <ControloUrgencyBadge urgency={urgency} next={next} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {next ? (
                      <>
                        <p>{ordinalControlo(next.numero)} — {formatDate(next.dataEsperada)}</p>
                        <p>{confirmed} confirmado{confirmed !== 1 ? 's' : ''}</p>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Sem controlos pendentes
                      </span>
                    )}
                    {showCriador && <p>Criador: {c.criador.nome}</p>}
                    {showBrigada && c.inquerito?.brigada && (
                      <p>Brigada: {c.inquerito.brigada.nome}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {next && !c.concluidoEm && (
                      <ConfirmButton controloId={c.id} realizacao={next} compact />
                    )}
                    {!c.concluidoEm && (
                      <ConcluirButton controloId={c.id} descricao={c.descricao} compact />
                    )}
                    <HistoryButton controloId={c.id} descricao={c.descricao} compact />
                    <EditButton controlo={c} compact />
                    <DeleteButton controloId={c.id} descricao={c.descricao} compact />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {total !== undefined && total > items.length && (
        <p className="text-xs text-muted-foreground text-center pt-1">
          A mostrar {items.length} de {total} controlos — filtre para ver mais.
        </p>
      )}
    </>
  )
}

function ControloUrgencyBadge({
  urgency,
  next,
}: {
  urgency: Urgency
  next: ControloRealizacaoItem | null
}) {
  if (!next) return null

  const date = typeof next.dataEsperada === 'string' ? new Date(next.dataEsperada) : next.dataEsperada
  const days = diasRestantes(date)

  let label: string
  if (days < 0) label = `Vencido há ${Math.abs(days)}d`
  else if (days === 0) label = 'Hoje'
  else if (days === 1) label = 'Amanhã'
  else label = `Em ${days} dias`

  const Icon = urgency === 'overdue' ? AlertTriangle : urgency === 'urgent' ? Bell : Clock

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        urgency === 'overdue' &&
          'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900',
        urgency === 'urgent' &&
          'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-900',
        urgency === 'soon' &&
          'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-900',
        urgency === 'ok' &&
          'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

function EditButton({
  controlo,
  compact = false,
}: {
  controlo: ControloItem
  compact?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [descricao, setDescricao] = useState(controlo.descricao)
  const [observacoes, setObservacoes] = useState(controlo.observacoes ?? '')
  const [alertaDias, setAlertaDias] = useState(String(controlo.alertaDias))

  function handleOpen() {
    setDescricao(controlo.descricao)
    setObservacoes(controlo.observacoes ?? '')
    setAlertaDias(String(controlo.alertaDias))
    setOpen(true)
  }

  async function submit() {
    const alertaDiasNum = parseInt(alertaDias, 10)
    if (!descricao.trim()) { toast.error('A descrição é obrigatória'); return }
    if (isNaN(alertaDiasNum) || alertaDiasNum < 1 || alertaDiasNum > 90) {
      toast.error('Dias de alerta deve ser entre 1 e 90'); return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/controlos/${controlo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: descricao.trim(),
          observacoes: observacoes.trim() || null,
          alertaDias: alertaDiasNum,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao atualizar controlo')
        return
      }
      toast.success('Controlo atualizado')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setLoading(false)
    }
  }

  async function reativar() {
    setLoading(true)
    try {
      const res = await fetch(`/api/controlos/${controlo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concluidoEm: null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao reativar controlo')
        return
      }
      toast.success('Controlo reativado')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={cn('gap-1', compact ? 'h-7 w-7 p-0' : 'h-8 px-2')}
        onClick={handleOpen}
        title="Editar controlo"
      >
        <Pencil className="h-3.5 w-3.5" />
        {!compact && <span className="sr-only">Editar</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar controlo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-descricao">Descrição *</Label>
              <Input
                id="edit-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-alerta">Alertar com antecedência (dias)</Label>
              <Input
                id="edit-alerta"
                type="number"
                min={1}
                max={90}
                value={alertaDias}
                onChange={(e) => setAlertaDias(e.target.value)}
                className="max-w-[120px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-obs">Observações</Label>
              <Textarea
                id="edit-obs"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>
          </div>
          {controlo.concluidoEm && (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 space-y-2">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Concluído em {formatDate(controlo.concluidoEm)}. Se foi por lapso, pode reativar.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={reativar}
                disabled={loading}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reativar controlo
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={loading || !!controlo.concluidoEm}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DeleteButton({
  controloId,
  descricao,
  compact = false,
}: {
  controloId: string
  descricao: string
  compact?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function confirm() {
    setLoading(true)
    try {
      const res = await fetch(`/api/controlos/${controloId}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao eliminar controlo')
        return
      }
      toast.success('Controlo eliminado')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={cn('gap-1 text-destructive hover:text-destructive', compact ? 'h-7 w-7 p-0' : 'h-8 px-2')}
        onClick={() => setOpen(true)}
        title="Eliminar controlo"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {!compact && <span className="sr-only">Eliminar</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar controlo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Vai eliminar permanentemente o controlo <strong>{descricao}</strong> e todo o
            histórico de realizações. Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirm}
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ConcluirButton({
  controloId,
  descricao,
  compact = false,
}: {
  controloId: string
  descricao: string
  compact?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function confirm() {
    setLoading(true)
    try {
      const res = await fetch(`/api/controlos/${controloId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concluidoEm: new Date().toISOString() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao concluir controlo')
        return
      }
      toast.success('Controlo marcado como concluído')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={cn('gap-1 text-green-700 hover:text-green-700 dark:text-green-500', compact ? 'h-7 w-7 p-0' : 'h-8 px-2')}
        onClick={() => setOpen(true)}
        title="Marcar como concluído"
      >
        <Flag className="h-3.5 w-3.5" />
        {!compact && <span className="sr-only">Concluir</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Concluir controlo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Vai marcar o controlo <strong>{descricao}</strong> como concluído. Pode reativar mais tarde através da edição.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={confirm}
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface ControloAuditEntry {
  id: string
  acao: string
  utilizadorNome: string | null
  detalhes: Record<string, unknown> | null
  ip: string | null
  createdAt: string
}

function HistoryButton({
  controloId,
  descricao,
  compact = false,
}: {
  controloId: string
  descricao: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<ControloAuditEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  async function handleOpen() {
    setOpen(true)
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/controlos/${controloId}/audit`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Erro a carregar histórico')
      }
      const d = await res.json()
      setEntries(d.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro a carregar histórico')
    } finally {
      setLoading(false)
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={cn('gap-1', compact ? 'h-7 w-7 p-0' : 'h-8 px-2')}
        onClick={handleOpen}
        title="Ver histórico"
      >
        <History className="h-3.5 w-3.5" />
        {!compact && <span className="sr-only">Histórico</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico do controlo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground line-clamp-2">{descricao}</p>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="text-sm text-red-600 py-2">{error}</p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sem entradas de histórico.
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ConfirmButton({
  controloId,
  realizacao,
  compact = false,
}: {
  controloId: string
  realizacao: ControloRealizacaoItem
  compact?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [obs, setObs] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setLoading(true)
    try {
      const res = await fetch(`/api/controlos/${controloId}/realizacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          realizacaoId: realizacao.id,
          observacoes: obs.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao confirmar controlo')
        return
      }
      toast.success(`${ordinalControlo(realizacao.numero)} confirmado`)
      setObs('')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede ao confirmar controlo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {compact ? (
        <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => setOpen(true)}>
          <CalendarCheck className="h-3.5 w-3.5" />
          Confirmar
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
          <CalendarCheck className="h-3.5 w-3.5" />
          Confirmar
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar {ordinalControlo(realizacao.numero)}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Data esperada: <strong>{formatDate(realizacao.dataEsperada)}</strong>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="obs-controlo">Observações (opcional)</Label>
            <Textarea
              id="obs-controlo"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={3}
              placeholder="Observações sobre a realização deste controlo..."
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar realização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
