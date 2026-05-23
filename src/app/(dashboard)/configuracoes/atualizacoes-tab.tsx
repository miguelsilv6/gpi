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
} from 'lucide-react'
import { formatDateTime, cn } from '@/lib/utils'

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
  } | null
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
  const pollingRef = useRef<number | null>(null)

  async function refreshStatus(silent = false) {
    if (!silent) setLoading(true)
    try {
      const [statusRes, histRes] = await Promise.all([
        fetch('/api/updates/status'),
        fetch('/api/updates/history?limit=20'),
      ])
      if (statusRes.ok) {
        const s = (await statusRes.json()) as StatusResponse
        setStatus(s)
      }
      if (histRes.ok) {
        const h = (await histRes.json()) as { items: HistoryItem[] }
        setHistory(h.items)
      }
    } catch {
      if (!silent) toast.error('Erro ao carregar estado de atualizações')
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

  async function handleStart() {
    if (!status?.latestTag) return
    setStarting(true)
    try {
      const res = await fetch('/api/updates/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
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
  const showFailureAlert =
    status.current && (status.current.state === 'FAILED' || status.current.state === 'ROLLED_BACK')

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
              Atualização em curso: v{status.current.fromVersion} → v{status.current.toVersion}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <StateBadge state={status.current.state} />
              <span className="text-xs text-muted-foreground">
                iniciado por {status.current.iniciadoPor} às {formatDateTime(status.current.startedAt)}
              </span>
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

            <p className="text-xs text-muted-foreground">
              A app está em modo de manutenção. Esta página vai recarregar automaticamente quando o sistema voltar a estar disponível.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Alerta de falha recente */}
      {showFailureAlert && status.current && (
        <Card className={cn(
          status.current.state === 'FAILED'
            ? 'border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20'
            : 'border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20',
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {status.current.state === 'FAILED' ? (
                <CircleAlert className="h-4 w-4 text-red-600" />
              ) : (
                <CircleCheck className="h-4 w-4 text-orange-600" />
              )}
              {status.current.state === 'FAILED'
                ? 'Última tentativa falhou'
                : 'Última atualização foi revertida'}
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
                  <TableRow key={h.id}>
                    <TableCell className="font-mono text-xs">
                      v{h.fromVersion} → v{h.toVersion}
                    </TableCell>
                    <TableCell>
                      <StateBadge state={h.state} />
                    </TableCell>
                    <TableCell className="text-xs">{h.iniciadoPor}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(h.startedAt)}</TableCell>
                    <TableCell className="text-xs">{formatDuration(h.durationMs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Confirmação */}
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
