'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  RefreshCw,
  Download,
  CircleCheck,
  CircleAlert,
  CircleArrowUp,
  History,
  Package,
  ScrollText,
  Ban,
  X,
} from 'lucide-react'
import { formatDateTime, cn, clientRandomId, iconButtonClasses } from '@/lib/utils'

type State =
  | 'AVAILABLE'
  | 'BACKING_UP'
  | 'PULLING'
  | 'MIGRATING'
  | 'BUILDING'
  | 'RESTARTING'
  | 'HEALTHCHECK'
  | 'DONE'
  | 'ROLLING_BACK'
  | 'ROLLED_BACK'
  | 'FAILED'

const STATE_LABELS: Record<State, string> = {
  AVAILABLE: 'Disponível',
  BACKING_UP: 'A criar backup',
  PULLING: 'A obter código',
  MIGRATING: 'A migrar BD',
  BUILDING: 'A construir imagem',
  RESTARTING: 'A reiniciar',
  HEALTHCHECK: 'A verificar saúde',
  DONE: 'Concluído',
  ROLLING_BACK: 'A reverter',
  ROLLED_BACK: 'Revertido',
  FAILED: 'Falhou',
}

const PROGRESS_ORDER: State[] = [
  'BACKING_UP',
  'PULLING',
  'MIGRATING',
  'BUILDING',
  'RESTARTING',
  'HEALTHCHECK',
  'DONE',
]

interface StatusResponse {
  currentVersion: string
  currentSha: string
  latestTag: string | null
  latestUrl: string | null
  latestNotes: string | null
  checkedAt: string | null
  updateAvailable: boolean
  maintenanceMode: boolean
  inProgress: boolean
  current: {
    id: string
    requestId: string
    fromVersion: string
    toVersion: string
    state: State
    preBackupFile: string | null
    startedAt: string
    finishedAt: string | null
    errorMessage: string | null
    rolledBack: boolean
    iniciadoPor: string
    log: LogEntry[]
  } | null
}

interface LogEntry {
  at: string
  label: string
  detail?: string
}

interface HistoryItem {
  id: string
  requestId: string
  fromVersion: string
  toVersion: string
  state: State
  preBackupFile: string | null
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  errorMessage: string | null
  rolledBack: boolean
  iniciadoPor: string
}

function StateBadge({ state }: { state: State }) {
  const variant: Record<State, string> = {
    AVAILABLE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    BACKING_UP: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    PULLING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    MIGRATING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    BUILDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    RESTARTING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    HEALTHCHECK: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    DONE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    ROLLING_BACK: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    ROLLED_BACK: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  }
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', variant[state])}>
      {STATE_LABELS[state]}
    </span>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Timeline vertical das fases de um update, com timestamp por linha. */
function UpdateLogTimeline({ entries }: { entries: LogEntry[] }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <ScrollText className="h-3.5 w-3.5" />
        Registo
      </p>
      <ol className="space-y-1.5">
        {entries.map((e, i) => (
          <li key={i} className="flex items-baseline gap-2 text-xs">
            <span className="font-mono text-muted-foreground tabular-nums shrink-0">
              {formatTime(e.at)}
            </span>
            <span className="font-medium">{e.label}</span>
            {e.detail && (
              <span className="text-muted-foreground truncate">— {e.detail}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Diálogo que carrega e mostra o registo de um update do histórico. */
function HistoryLogDialog({
  target,
  onClose,
}: {
  target: { id: string; label: string } | null
  onClose: () => void
}) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!target) {
      setEntries(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/updates/${target.id}/log`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { items: LogEntry[] }) => {
        if (!cancelled) setEntries(d.items)
      })
      .catch(() => {
        if (!cancelled) {
          setEntries([])
          toast.error('Erro ao carregar registo')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [target])

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Registo — {target?.label}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries && entries.length > 0 ? (
          <UpdateLogTimeline entries={entries} />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            Sem registo disponível.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remSec = seconds % 60
  return `${minutes}m ${remSec}s`
}

export function AtualizacoesTab() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [forceAborting, setForceAborting] = useState(false)
  const [confirmForceAbortOpen, setConfirmForceAbortOpen] = useState(false)
  const [logDialog, setLogDialog] = useState<{ id: string; label: string } | null>(null)
  // O painel de falha só aparece se o update falhou DURANTE esta sessão
  // (wasInProgressRef foi true). Ao navegar, o componente desmonta e o estado
  // reseta — o painel não volta a aparecer em visitas subsequentes.
  const wasInProgressRef = useRef(false)
  const [showFailurePanel, setShowFailurePanel] = useState(false)
  const [failurePanelDismissed, setFailurePanelDismissed] = useState(false)
  // Quando os polls falham durante um update (app a reiniciar), mostramos
  // "a aguardar resposta" em vez de a barra parecer simplesmente congelada.
  const [pollStalled, setPollStalled] = useState(false)
  const pollFailuresRef = useRef(0)
  const pollingRef = useRef<number | null>(null)

  async function refreshStatus(silent = false) {
    if (!silent) setLoading(true)
    try {
      const [statusRes, histRes] = await Promise.all([
        fetch('/api/updates/status'),
        fetch('/api/updates/history?limit=20'),
      ])
      // Poll falhado (app em baixo durante restart) → conta para o
      // indicador "a aguardar resposta". 2 falhas seguidas (~4s) ativam-no.
      if (silent && !statusRes.ok) {
        pollFailuresRef.current += 1
        if (pollFailuresRef.current >= 2) setPollStalled(true)
        return
      }
      if (silent && statusRes.ok) {
        pollFailuresRef.current = 0
        setPollStalled(false)
      }
      if (statusRes.ok) {
        const s = (await statusRes.json()) as StatusResponse
        setStatus(s)
      }
      if (histRes.ok) {
        const h = (await histRes.json()) as { items: HistoryItem[] }
        setHistory(h.items)
      }
    } catch {
      if (silent) {
        // App provavelmente em baixo (restart) — conta como poll falhado.
        pollFailuresRef.current += 1
        if (pollFailuresRef.current >= 2) setPollStalled(true)
      } else {
        toast.error('Erro ao carregar estado de atualizações')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  // Polling enquanto há um update em curso.
  useEffect(() => {
    if (!status?.inProgress) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      return
    }
    if (pollingRef.current) return
    pollingRef.current = window.setInterval(() => {
      void refreshStatus(true)
    }, 2000)
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [status?.inProgress])

  // Rastreia se houve um update em progresso nesta sessão para controlar
  // a visibilidade do painel de falha.
  useEffect(() => {
    if (!status) return
    if (status.inProgress) {
      wasInProgressRef.current = true
      setFailurePanelDismissed(false)
    } else if (wasInProgressRef.current) {
      const st = status.current?.state
      if (st === 'FAILED' || st === 'ROLLED_BACK') {
        setShowFailurePanel(true)
      } else if (st === 'DONE') {
        wasInProgressRef.current = false
        setShowFailurePanel(false)
      }
    }
  }, [status?.inProgress, status?.current?.state])

  // Quando um update acaba de transitar para DONE, refresh da página para
  // que a sidebar mostre a nova versão (depois de o container reiniciar).
  useEffect(() => {
    if (!status?.current) return
    if (status.current.state === 'DONE' && status.current.finishedAt) {
      const finishedAgoMs = Date.now() - new Date(status.current.finishedAt).getTime()
      if (finishedAgoMs < 10_000) {
        const t = setTimeout(() => window.location.reload(), 3000)
        return () => clearTimeout(t)
      }
    }
  }, [status?.current?.state, status?.current?.finishedAt])

  async function handleCheck() {
    setChecking(true)
    try {
      const res = await fetch('/api/updates/check', { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao verificar')
        return
      }
      const body = await res.json()
      if (body.cached) {
        toast.info('Verificação recente — a usar cache (debounce 60s)')
      } else if (body.updateAvailable) {
        toast.success(`Atualização disponível: v${body.latestTag}`)
      } else {
        toast.success('Sistema na última versão')
      }
      refreshStatus(true)
    } finally {
      setChecking(false)
    }
  }

  async function handleCancel(id: string) {
    setCancelling(true)
    try {
      const res = await fetch('/api/updates/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao cancelar')
        return
      }
      toast.success('Atualização cancelada')
      refreshStatus(true)
    } finally {
      setCancelling(false)
    }
  }

  async function handleForceAbort(id: string) {
    setForceAborting(true)
    try {
      const res = await fetch('/api/updates/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, force: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao forçar cancelamento')
        return
      }
      toast.success('Atualização abortada e modo de manutenção desativado')
      refreshStatus(true)
    } finally {
      setForceAborting(false)
      setConfirmForceAbortOpen(false)
    }
  }

  async function handleStart() {
    if (!status?.latestTag) return
    setStarting(true)
    try {
      const res = await fetch('/api/updates/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': clientRandomId(),
        },
        body: JSON.stringify({ targetTag: status.latestTag }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao iniciar atualização')
        return
      }
      toast.success(`Atualização para v${status.latestTag} iniciada`)
      setConfirmOpen(false)
      refreshStatus(true)
    } catch {
      // Rede ou erro inesperado — surface em vez de falhar em silêncio.
      toast.error('Erro de rede ao iniciar atualização')
    } finally {
      setStarting(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">A carregar...</div>
  }

  if (!status) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        Sem dados disponíveis.
      </div>
    )
  }

  const currentState = status.current?.state
  const inProgress = status.inProgress

  return (
    <div className="space-y-4">
      {/* Versão atual */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Versão atual
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-mono font-semibold">v{status.currentVersion}</span>
            <span className="text-xs text-muted-foreground font-mono">
              ({status.currentSha})
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Versão disponível */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CircleArrowUp className="h-4 w-4" />
            Versão disponível
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              {status.latestTag ? (
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-lg font-mono font-semibold">v{status.latestTag}</span>
                  {status.updateAvailable ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 font-medium">
                      Nova
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 font-medium">
                      Sistema atualizado
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground italic">
                  Sem informação de versão remota — clique "Verificar agora".
                </span>
              )}
              {status.checkedAt && (
                <p className="text-xs text-muted-foreground">
                  Última verificação: {formatDateTime(status.checkedAt)}
                </p>
              )}
              {status.latestUrl && (
                <a
                  href={status.latestUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Ver release notes →
                </a>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheck}
              disabled={checking || inProgress}
            >
              {checking ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Verificar agora
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Atualizar */}
      {status.updateAvailable && !inProgress && status.latestTag && (
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="h-4 w-4" />
              Atualizar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Pode atualizar para <strong>v{status.latestTag}</strong>. O sistema cria
              automaticamente um backup, aplica a nova versão e verifica que arranca correctamente.
              Em caso de falha, é feito rollback automático.
            </p>
            <Button onClick={() => setConfirmOpen(true)}>
              <Download className="h-4 w-4 mr-1.5" />
              Atualizar para v{status.latestTag}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progresso em curso */}
      {inProgress && status.current && (
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {status.current.state === 'AVAILABLE'
                ? `Atualização enfileirada: v${status.current.fromVersion} → v${status.current.toVersion}`
                : `Atualização em curso: v${status.current.fromVersion} → v${status.current.toVersion}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <StateBadge state={status.current.state} />
              <span className="text-xs text-muted-foreground">
                iniciado por {status.current.iniciadoPor} às {formatDateTime(status.current.startedAt)}
              </span>
              {status.current.state === 'AVAILABLE' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-red-600 hover:text-red-700"
                  onClick={() => handleCancel(status.current!.id)}
                  disabled={cancelling}
                >
                  {cancelling && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                  Cancelar
                </Button>
              )}
              {status.current.state !== 'AVAILABLE' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-red-700 hover:text-red-800"
                  onClick={() => setConfirmForceAbortOpen(true)}
                  disabled={forceAborting}
                >
                  <Ban className="mr-1.5 h-3 w-3" />
                  Forçar cancelamento
                </Button>
              )}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {PROGRESS_ORDER.map((s) => {
                const currentIdx = currentState ? PROGRESS_ORDER.indexOf(currentState) : -1
                const stepIdx = PROGRESS_ORDER.indexOf(s)
                const done = stepIdx < currentIdx || status.current?.state === 'DONE'
                const active = s === status.current?.state
                return (
                  <div key={s} className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        'w-full h-2 rounded-full transition-colors',
                        done
                          ? 'bg-green-500'
                          : active
                            ? 'bg-amber-500 animate-pulse'
                            : 'bg-muted',
                      )}
                    />
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">
                      {STATE_LABELS[s]}
                    </span>
                  </div>
                )
              })}
            </div>

            {pollStalled ? (
              <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Sistema a reiniciar — a aguardar resposta. A página recarrega assim que voltar.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {status.current.state === 'AVAILABLE'
                  ? 'À espera de o worker começar o backup (até 10 segundos). Pode cancelar enquanto não começa.'
                  : 'A app está em modo de manutenção. Esta página vai recarregar automaticamente quando o sistema voltar a estar disponível.'}
              </p>
            )}

            {/* Registo cronológico (timeline) das fases já registadas. */}
            {status.current.log.length > 0 && (
              <UpdateLogTimeline entries={status.current.log} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Alerta de falha — só visível se a falha aconteceu nesta sessão */}
      {showFailurePanel && !failurePanelDismissed && status.current && (
        <Card className={cn(
          status.current.state === 'FAILED'
            ? 'border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20'
            : 'border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20',
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                {status.current.state === 'FAILED' ? (
                  <CircleAlert className="h-4 w-4 text-red-600" />
                ) : (
                  <CircleCheck className="h-4 w-4 text-orange-600" />
                )}
                {status.current.state === 'FAILED'
                  ? 'Última tentativa falhou'
                  : 'Última atualização foi revertida'}
              </span>
              <button
                type="button"
                onClick={() => setFailurePanelDismissed(true)}
                className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                aria-label="Fechar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Tentativa v{status.current.fromVersion} → v{status.current.toVersion} terminou como{' '}
              <StateBadge state={status.current.state} />.
            </p>
            {status.current.errorMessage && (
              <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap break-words">
                {status.current.errorMessage}
              </pre>
            )}
            {status.current.preBackupFile && (
              <p className="text-xs text-muted-foreground">
                Backup pré-atualização: <span className="font-mono">{status.current.preBackupFile}</span>
              </p>
            )}
            {status.maintenanceMode && status.current.state === 'FAILED' && (
              <p className="text-xs font-medium text-red-700 dark:text-red-300">
                Sistema continua em modo de manutenção. Consulte os logs do gpi-updater no host antes de desligar manutenção em Backups.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico ({history.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sem atualizações registadas.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Versão</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Iniciado por</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Duração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow
                    key={h.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setLogDialog({ id: h.id, label: `v${h.fromVersion} → v${h.toVersion}` })}
                  >
                    <TableCell className="font-mono text-xs">
                      v{h.fromVersion} → v{h.toVersion}
                    </TableCell>
                    <TableCell>
                      <StateBadge state={h.state} />
                    </TableCell>
                    <TableCell className="text-xs">{h.iniciadoPor}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(h.startedAt)}</TableCell>
                    <TableCell className="text-xs flex items-center justify-between gap-2">
                      {formatDuration(h.durationMs)}
                      <ScrollText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de registo de um update do histórico */}
      <HistoryLogDialog
        target={logDialog}
        onClose={() => setLogDialog(null)}
      />

      {/* Confirmação */}
      <Dialog open={confirmForceAbortOpen} onOpenChange={(o) => !o && setConfirmForceAbortOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Ban className="h-4 w-4" />
              Forçar cancelamento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Esta ação interrompe imediatamente o processo de atualização no estado{' '}
              <strong>{status.current ? STATE_LABELS[status.current.state] : ''}</strong> e marca-o como{' '}
              <strong>Falhou</strong>.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>O processo do host pode continuar a correr — pare manualmente o <span className="font-mono">gpi-updater</span> se necessário.</li>
              <li>O modo de manutenção é desativado.</li>
              <li>Os ficheiros de controlo são removidos.</li>
              <li>Use apenas quando a atualização ficou presa e não avança.</li>
            </ul>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmForceAbortOpen(false)}
              disabled={forceAborting}
            >
              Não cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => status.current && handleForceAbort(status.current.id)}
              disabled={forceAborting}
            >
              {forceAborting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Forçar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar atualização</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Vai atualizar de <strong>v{status.currentVersion}</strong> para{' '}
              <strong>v{status.latestTag}</strong>.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>É criado automaticamente um backup completo da BD.</li>
              <li>Durante a operação, o sistema fica em modo de manutenção (2-5 min).</li>
              <li>Utilizadores não-administradores verão "sistema em manutenção" (503).</li>
              <li>Em caso de falha, o sistema é revertido automaticamente para v{status.currentVersion}.</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={starting}>
              Cancelar
            </Button>
            <Button onClick={handleStart} disabled={starting}>
              {starting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Atualizar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
