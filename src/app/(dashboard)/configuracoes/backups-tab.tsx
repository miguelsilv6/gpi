'use client'

import { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog'
import {
  Loader2,
  Database,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  PlayCircle,
  Wrench,
} from 'lucide-react'
import { formatDateTime, cn, iconButtonClasses } from '@/lib/utils'

interface BackupRow {
  filename: string
  size: number
  createdAt: string
  kind: 'auto' | 'manual' | 'prerestore'
}

interface SistemaConfig {
  backupScheduleCron: string
  maintenanceMode: boolean
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function BackupsTab() {
  const [files, setFiles] = useState<BackupRow[]>([])
  const [config, setConfig] = useState<SistemaConfig | null>(null)
  const [cronInput, setCronInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [savingCron, setSavingCron] = useState(false)
  const [togglingMaintenance, setTogglingMaintenance] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BackupRow | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<BackupRow | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    setLoading(true)
    try {
      const [filesRes, cfgRes] = await Promise.all([
        fetch('/api/backups'),
        fetch('/api/configuracoes'),
      ])
      if (filesRes.ok) {
        const json = await filesRes.json()
        setFiles(json.files ?? [])
      }
      if (cfgRes.ok) {
        const cfg = await cfgRes.json()
        setConfig({
          backupScheduleCron: cfg.backupScheduleCron,
          maintenanceMode: cfg.maintenanceMode,
        })
        setCronInput(cfg.backupScheduleCron)
      }
    } catch {
      toast.error('Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch('/api/backups', { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao criar backup')
        return
      }
      const body = await res.json()
      toast.success(`Backup criado: ${body.filename} (${formatBytes(body.size)})`)
      refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setCreating(false)
    }
  }

  async function handleSaveCron() {
    setSavingCron(true)
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupScheduleCron: cronInput.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar agendamento')
        return
      }
      toast.success('Agendamento guardado (aplicado em até 1 minuto)')
      refresh()
    } finally {
      setSavingCron(false)
    }
  }

  async function handleToggleMaintenance() {
    if (!config) return
    setTogglingMaintenance(true)
    try {
      const next = !config.maintenanceMode
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maintenanceMode: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro')
        return
      }
      toast.success(next ? 'Modo de manutenção ATIVADO' : 'Modo de manutenção desligado')
      refresh()
    } finally {
      setTogglingMaintenance(false)
    }
  }

  async function handleDownload(file: BackupRow) {
    window.open(`/api/backups/${encodeURIComponent(file.filename)}/download`, '_blank')
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      const res = await fetch(`/api/backups/${encodeURIComponent(deleteTarget.filename)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao eliminar')
        return
      }
      toast.success('Backup eliminado')
      setDeleteTarget(null)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    if (!restoreTarget) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/backups/${encodeURIComponent(restoreTarget.filename)}/restore`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: 'RESTAURAR' }),
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao restaurar')
        return
      }
      const body = await res.json()
      toast.success(
        `Restauro OK. Pre-snapshot: ${body.prerestoreFilename}. Sistema fora de manutenção.`,
      )
      setRestoreTarget(null)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch('/api/backups/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro no upload')
        return
      }
      const body = await res.json()
      toast.success(`Backup carregado: ${body.filename}`)
      refresh()
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const lastAuto = files.find((f) => f.kind !== 'prerestore')

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">A carregar...</div>
  }

  return (
    <div className="space-y-4">
      {/* Maintenance toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Modo de manutenção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm">
                {config?.maintenanceMode ? (
                  <span className="text-amber-700 font-medium">Sistema em manutenção — não-admins veem 503.</span>
                ) : (
                  <span className="text-muted-foreground">Sistema operacional.</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Activado automaticamente durante restauros. Pode também ser usado para janelas planeadas.
              </p>
            </div>
            <Button
              variant={config?.maintenanceMode ? 'destructive' : 'outline'}
              size="sm"
              onClick={handleToggleMaintenance}
              disabled={togglingMaintenance}
            >
              {togglingMaintenance && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {config?.maintenanceMode ? 'Desligar manutenção' : 'Ativar manutenção'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PlayCircle className="h-4 w-4" />
            Agendamento de backups
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cron">Expressão cron</Label>
            <div className="flex gap-2">
              <Input
                id="cron"
                value={cronInput}
                onChange={(e) => setCronInput(e.target.value)}
                placeholder="0 2 * * *"
                className="font-mono"
              />
              <Button onClick={handleSaveCron} disabled={savingCron || cronInput === config?.backupScheduleCron}>
                {savingCron && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ex: <code>0 2 * * *</code> = todos os dias às 02:00. Aplicado em até 1 minuto pelo worker.
            </p>
          </div>
          {lastAuto && (
            <p className="text-xs text-muted-foreground">
              Último backup: <span className="font-mono">{lastAuto.filename}</span> em{' '}
              {formatDateTime(lastAuto.createdAt)} ({formatBytes(lastAuto.size)})
            </p>
          )}
        </CardContent>
      </Card>

      {/* Manual create + upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            Operações
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <Database className="h-4 w-4 mr-1.5" />
            Criar backup agora
          </Button>
          <div>
            <input
              type="file"
              accept=".gz,.sql.gz,application/gzip"
              ref={fileInputRef}
              onChange={handleUpload}
              className="hidden"
              id="backup-upload"
            />
            <label
              htmlFor="backup-upload"
              className={cn(
                'inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted hover:text-foreground transition-colors',
                uploading && 'pointer-events-none opacity-50',
              )}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Carregar ficheiro externo (.sql.gz)
            </label>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Backups disponíveis ({files.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sem backups registados.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.filename}>
                    <TableCell className="font-mono text-xs">{f.filename}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          f.kind === 'prerestore'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
                        )}
                      >
                        {f.kind === 'prerestore' ? 'Pré-restauro' : 'Backup'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{formatDateTime(f.createdAt)}</TableCell>
                    <TableCell className="text-xs">{formatBytes(f.size)}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleDownload(f)}
                          className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                          title="Descarregar"
                          aria-label={`Descarregar ${f.filename}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRestoreTarget(f)}
                          className={cn(iconButtonClasses, 'text-amber-600 hover:text-amber-700')}
                          title="Restaurar"
                          aria-label={`Restaurar ${f.filename}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(f)}
                          className={cn(iconButtonClasses, 'text-red-500 hover:text-red-700')}
                          title="Eliminar"
                          aria-label={`Eliminar ${f.filename}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar backup"
        entityLabel={deleteTarget?.filename ?? ''}
        description="O ficheiro é removido permanentemente do servidor. Se for o único backup recente, considere descarregar antes."
        confirmToken="ELIMINAR"
        inputLabel="Para confirmar, digite"
        destructiveLabel="Eliminar"
        onConfirm={handleDelete}
        loading={busy}
      />

      <ConfirmDeleteDialog
        open={!!restoreTarget}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title="Restaurar backup"
        entityLabel={restoreTarget?.filename ?? ''}
        description="Esta operação SUBSTITUI todos os dados actuais pelos do backup. Um snapshot de segurança (pré-restauro) é gravado automaticamente antes. Enquanto corre, utilizadores não-administradores veem 'sistema em manutenção'."
        confirmToken="RESTAURAR"
        inputLabel="Para confirmar, digite"
        destructiveLabel="Restaurar agora"
        onConfirm={handleRestore}
        loading={busy}
      />
    </div>
  )
}
