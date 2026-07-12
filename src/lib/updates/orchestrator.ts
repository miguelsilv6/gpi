/**
 * Orquestrador do fluxo de auto-atualização.
 *
 * Responsabilidades:
 *  - Pre-flight: valida pedido, faz backup, escreve trigger no volume
 *    partilhado para o host daemon executar a atualização.
 *  - Reconciliação: o worker corre `reconcileFromStatusFile()` num tick para
 *    ler o ficheiro de status escrito pelo host daemon e refletir o estado
 *    em `AtualizacaoSistema`.
 *
 * O ficheiro de controlo vive em `/app/control` (configurável via
 * UPDATES_CONTROL_DIR). Em produção esse caminho é um bind mount partilhado
 * entre o app/worker e o host daemon. Em dev pode não existir — todas as
 * funções tratam ENOENT silenciosamente.
 */
// Server-only module: usado por API routes (em /app/api/updates/*) e pelo
// cron worker. Nunca importado de código client-side.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { childLogger } from '@/lib/logger'
import { runBackup } from '@/lib/cron'
import { APP_VERSION, APP_GIT_SHA } from '@/lib/version'
import {
  assertTransition,
  isInProgress,
  isTerminal,
  STATE_LABELS,
  type UpdateState,
} from './state-machine'
import { isNewerVersion } from './github'

const log = childLogger({ subsystem: 'updates/orchestrator' })

export const CONTROL_DIR = process.env.UPDATES_CONTROL_DIR ?? '/app/control'
const TRIGGER_FILE = 'update.request.json'
const STATUS_FILE = 'update.status.json'

export interface UpdateTrigger {
  requestId: string
  fromSha: string
  fromVersion: string
  toTag: string
  preBackupFile: string
  issuedAt: string
}

export interface UpdateStatus {
  requestId: string
  state: UpdateState
  toCommitSha?: string
  errorMessage?: string
  updatedAt: string
}

export interface UpdateLogEntry {
  at: string
  label: string
  detail?: string
}

/**
 * Reconstrói o registo cronológico de um update a partir dos audit logs
 * (cada transição grava `UPDATE_STATE`; o enqueue/falha/cancelamento têm
 * acções próprias). Não há tabela de logs dedicada — reutilizamos o que já
 * é escrito em `auditLog` keyed por entidade='AtualizacaoSistema'.
 */
export async function getUpdateLog(id: string): Promise<UpdateLogEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entidade: 'AtualizacaoSistema', entidadeId: id },
    orderBy: { createdAt: 'asc' },
    select: { acao: true, createdAt: true, detalhes: true },
  })
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  return rows.map((r) => {
    const d = (r.detalhes ?? {}) as Record<string, any>
    let label: string
    let detail: string | undefined
    switch (r.acao) {
      case 'UPDATE_ENQUEUED': {
        const from = str(d.fromVersion)
        const to = str(d.toVersion)
        label = 'Enfileirada'
        detail = from && to ? `v${from} → v${to}` : undefined
        break
      }
      case 'UPDATE_STATE': {
        const toState = str(d.to)
        const fromState = str(d.from)
        label = (toState && STATE_LABELS[toState as UpdateState]) ?? toState ?? 'Transição'
        if (fromState) {
          const fromLabel = STATE_LABELS[fromState as UpdateState] ?? fromState
          detail = `${fromLabel} → ${label}`
        }
        break
      }
      case 'UPDATE_FAILED': {
        label = 'Falhou'
        detail = [str(d.phase), str(d.error)].filter(Boolean).join(': ') || undefined
        break
      }
      case 'UPDATE_CANCELLED':
        label = 'Cancelada'
        break
      case 'UPDATE_FORCE_ABORTED':
        label = 'Abortada (forçado)'
        detail = str(d.previousState) ? `estava em ${STATE_LABELS[d.previousState as UpdateState] ?? d.previousState}` : undefined
        break
      case 'UPDATE_LOG':
        label = str(d.msg) ?? '—'
        break
      default:
        label = r.acao
    }
    return { at: r.createdAt.toISOString(), label, detail }
  })
}

async function ensureControlDir(): Promise<void> {
  try {
    await fs.mkdir(CONTROL_DIR, { recursive: true })
  } catch (err) {
    log.warn({ err, dir: CONTROL_DIR }, 'mkdir controlDir falhou (continuando)')
  }
}

async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(CONTROL_DIR, file), 'utf8')
    return JSON.parse(raw) as T
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      return null
    }
    log.warn({ err, file }, 'Falha a ler ficheiro de controlo')
    return null
  }
}

async function writeJsonFile(file: string, data: unknown): Promise<void> {
  await ensureControlDir()
  const fullPath = path.join(CONTROL_DIR, file)
  // Escrita atómica: tmp + rename. Evita que o leitor (cron tick / daemon)
  // apanhe um ficheiro a meio.
  const tmp = `${fullPath}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8' })
  await fs.rename(tmp, fullPath)
}

export async function readStatus(): Promise<UpdateStatus | null> {
  return readJsonFile<UpdateStatus>(STATUS_FILE)
}

export async function readTrigger(): Promise<UpdateTrigger | null> {
  return readJsonFile<UpdateTrigger>(TRIGGER_FILE)
}

/**
 * Enfileira uma atualização. Chamada pelo handler POST /api/updates/start.
 *
 * **Retorna imediatamente após criar o registo em AVAILABLE** — o backup
 * (que pode demorar minutos) corre depois no worker via
 * `processAvailableUpdates()`. Isto evita bloquear o event loop do app e
 * timeouts do cliente, e mantém a request HTTP em <100ms.
 *
 * Garantias:
 *  - Recusa se já existir uma atualização em curso (linha não-terminal,
 *    incluindo AVAILABLE — uma linha enfileirada conta como concorrente).
 *  - Recusa downgrade (`targetTag` <= versão atual).
 *  - Reutiliza linha existente se o `requestId` (idempotency key) já foi visto.
 *  - Modo de manutenção ligado já aqui — o admin sabe que ao confirmar não
 *    há volta atrás (excepto via /api/updates/cancel enquanto em AVAILABLE).
 */
export async function startUpdate(opts: {
  targetTag: string
  requestId?: string
  userId: string
}): Promise<{ id: string; alreadyRunning?: boolean }> {
  const requestId = opts.requestId?.trim() || randomUUID()

  // Idempotência: se já vimos este requestId, devolve a linha existente.
  const existing = await prisma.atualizacaoSistema.findUnique({
    where: { requestId },
  })
  if (existing) {
    return { id: existing.id, alreadyRunning: !isTerminal(existing.state as UpdateState) }
  }

  // Recusa se há outra atualização em curso (inclui AVAILABLE enfileirada).
  const inFlight = await prisma.atualizacaoSistema.findFirst({
    where: { finishedAt: null },
    orderBy: { startedAt: 'desc' },
  })
  if (inFlight && isInProgress(inFlight.state as UpdateState)) {
    const e = new Error('Já existe uma atualização em curso')
    ;(e as Error & { cause?: number }).cause = 409
    throw e
  }

  // Anti-downgrade.
  if (!isNewerVersion(opts.targetTag, APP_VERSION)) {
    const e = new Error(
      `Versão ${opts.targetTag} não é superior à atual (${APP_VERSION})`,
    )
    ;(e as Error & { cause?: number }).cause = 400
    throw e
  }

  const fromVersion = APP_VERSION
  const fromSha = APP_GIT_SHA
  const toVersion = opts.targetTag.replace(/^v/, '')

  const row = await prisma.atualizacaoSistema.create({
    data: {
      requestId,
      fromVersion,
      toVersion,
      fromCommitSha: fromSha,
      state: 'AVAILABLE',
      iniciadoPorId: opts.userId,
    },
  })

  await prisma.auditLog.create({
    data: {
      acao: 'UPDATE_ENQUEUED',
      entidade: 'AtualizacaoSistema',
      entidadeId: row.id,
      utilizadorId: opts.userId,
      detalhes: { fromVersion, toVersion, fromSha, requestId },
    },
  })

  // Ligar modo de manutenção. Não-admins veem 503 a partir daqui — o ciclo
  // é confirmado-irreversível excepto pelo cancel enquanto em AVAILABLE.
  await prisma.configuracaoSistema.update({
    where: { id: 'singleton' },
    data: { maintenanceMode: true },
  })

  return { id: row.id }
}

/**
 * Processa atualizações em estado AVAILABLE: corre o backup pré-atualização
 * (potencialmente vários minutos) e escreve o ficheiro de trigger para o
 * host daemon.
 *
 * Chamado pelo worker num tick (~10s). Idempotente — se já está a correr
 * para um id, o lock em runBackup (flock no script) e o estado da linha
 * impedem dupla execução.
 *
 * Falhas do backup transitam a linha para FAILED e desligam manutenção
 * (nada de destrutivo foi tocado).
 */
export async function processAvailableUpdates(): Promise<void> {
  // Procura uma única linha em AVAILABLE — o flock no script garante
  // mutex se acontecer outra invocação concorrente.
  const row = await prisma.atualizacaoSistema.findFirst({
    where: { state: 'AVAILABLE' },
    orderBy: { startedAt: 'asc' },
  })
  if (!row) return

  // Linha pode ter sido cancelada entre a query e aqui — recheck.
  if (row.state !== 'AVAILABLE') return

  // Reservar a linha: transitar para BACKING_UP. Falha se outro worker
  // já fez a transição (state machine recusa).
  try {
    await updateState(row.id, 'AVAILABLE', 'BACKING_UP')
  } catch {
    log.info({ id: row.id }, 'Outro worker já está a processar — saltar')
    return
  }

  let backupFilename: string
  try {
    backupFilename = await runBackup({
      source: 'pre_restauro',
      prefix: 'gpi_prerestore_',
      retention: 10,
      utilizadorId: row.iniciadoPorId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erro desconhecido'
    await prisma.atualizacaoSistema.update({
      where: { id: row.id },
      data: {
        state: 'FAILED',
        finishedAt: new Date(),
        errorMessage: `Backup pré-atualização falhou: ${msg}`,
      },
    })
    await prisma.configuracaoSistema.update({
      where: { id: 'singleton' },
      data: { maintenanceMode: false },
    })
    await prisma.auditLog.create({
      data: {
        acao: 'UPDATE_FAILED',
        entidade: 'AtualizacaoSistema',
        entidadeId: row.id,
        utilizadorId: row.iniciadoPorId,
        detalhes: { phase: 'BACKING_UP', error: msg },
      },
    })
    return
  }

  await prisma.atualizacaoSistema.update({
    where: { id: row.id },
    data: { preBackupFile: backupFilename },
  })

  await updateState(row.id, 'BACKING_UP', 'PULLING')

  const trigger: UpdateTrigger = {
    requestId: row.requestId,
    fromSha: row.fromCommitSha,
    fromVersion: row.fromVersion,
    toTag: row.toVersion.startsWith('v') ? row.toVersion : `v${row.toVersion}`,
    preBackupFile: backupFilename,
    issuedAt: new Date().toISOString(),
  }
  await writeJsonFile(TRIGGER_FILE, trigger)
  await writeJsonFile(STATUS_FILE, {
    requestId: row.requestId,
    state: 'PULLING',
    updatedAt: new Date().toISOString(),
  } satisfies UpdateStatus)
}

async function updateState(
  id: string,
  from: UpdateState,
  to: UpdateState,
  extra: Partial<{ errorMessage: string; toCommitSha: string; rolledBack: boolean }> = {},
): Promise<void> {
  assertTransition(from, to)
  await prisma.atualizacaoSistema.update({
    where: { id },
    data: {
      state: to,
      finishedAt: isTerminal(to) ? new Date() : null,
      ...extra,
    },
  })
  await prisma.auditLog.create({
    data: {
      acao: 'UPDATE_STATE',
      entidade: 'AtualizacaoSistema',
      entidadeId: id,
      utilizadorId: '__system__',
      detalhes: { from, to, ...extra },
    },
  })
}

/**
 * Chamado pelo worker num tick (~5s) enquanto existirem updates não-terminais.
 * Lê o ficheiro de status escrito pelo host daemon e propaga-o para
 * `AtualizacaoSistema`. Idempotente — escrever o mesmo estado não tem efeito.
 */
export async function reconcileFromStatusFile(): Promise<void> {
  const status = await readStatus()
  if (!status) return

  const row = await prisma.atualizacaoSistema.findUnique({
    where: { requestId: status.requestId },
  })
  if (!row) {
    log.warn({ requestId: status.requestId }, 'Status sem linha correspondente')
    return
  }

  const current = row.state as UpdateState
  const next = status.state

  if (current === next) return
  if (isTerminal(current)) return // nunca reverter de um estado terminal

  // O daemon pode pular estados intermédios (ex: passar direto de PULLING
  // para HEALTHCHECK em ambientes sem migrações). Validamos cada hop possível.
  if (!isValidJump(current, next)) {
    log.warn(
      { current, next, requestId: status.requestId },
      'Salto de estado inválido — a ignorar',
    )
    return
  }

  await prisma.atualizacaoSistema.update({
    where: { id: row.id },
    data: {
      state: next,
      toCommitSha: status.toCommitSha ?? row.toCommitSha,
      errorMessage: status.errorMessage ?? row.errorMessage,
      finishedAt: isTerminal(next) ? new Date() : null,
      rolledBack: next === 'ROLLED_BACK' ? true : row.rolledBack,
    },
  })

  await prisma.auditLog.create({
    data: {
      acao: 'UPDATE_STATE',
      entidade: 'AtualizacaoSistema',
      entidadeId: row.id,
      utilizadorId: '__system__',
      detalhes: { from: current, to: next, source: 'reconciler' },
    },
  })

  // Sync daemon log lines written since the last tick.
  await syncDaemonLogs(row.id, status.requestId).catch(() => {})

  // Em estados terminais limpamos os ficheiros de controlo para que uma
  // próxima atualização não os apanhe stale. Tentativa best-effort.
  if (isTerminal(next)) {
    void cleanupControlFiles().catch(() => {})
  }
}

/**
 * Permite que o daemon faça saltos longos (ex: PULLING → BUILDING) já que
 * algumas fases podem ser muito rápidas e não justificam status writes
 * intermédios. A regra: cada hop tem de ser alcançável seguindo o grafo
 * nominal sem voltar atrás.
 */
function isValidJump(from: UpdateState, to: UpdateState): boolean {
  if (from === to) return true
  const order: UpdateState[] = [
    'AVAILABLE',
    'BACKING_UP',
    'PULLING',
    'MIGRATING',
    'BUILDING',
    'RESTARTING',
    'HEALTHCHECK',
    'DONE',
  ]
  const fi = order.indexOf(from)
  const ti = order.indexOf(to)
  if (fi >= 0 && ti > fi) return true
  // Qualquer estado não-terminal pode ir para ROLLING_BACK.
  if (to === 'ROLLING_BACK' && !isTerminal(from)) return true
  // ROLLING_BACK pode ir para terminais de falha.
  if (from === 'ROLLING_BACK' && (to === 'ROLLED_BACK' || to === 'FAILED')) return true
  // BACKING_UP → FAILED é permitido (não há nada para reverter).
  if (from === 'BACKING_UP' && to === 'FAILED') return true
  return false
}

async function cleanupControlFiles(): Promise<void> {
  for (const f of [TRIGGER_FILE, STATUS_FILE, 'update.log.jsonl']) {
    try {
      await fs.unlink(path.join(CONTROL_DIR, f))
    } catch {
      // ENOENT é o caso normal — ignorar
    }
  }
}

/**
 * Lê `update.log.jsonl` do control dir (escrito pelo host daemon) e
 * sincroniza linhas novas para `auditLog` como entradas UPDATE_LOG.
 * Idempotente: conta as entradas já existentes e salta esse número de linhas.
 */
async function syncDaemonLogs(updateId: string, requestId: string): Promise<void> {
  const logPath = path.join(CONTROL_DIR, 'update.log.jsonl')
  let raw: string
  try {
    raw = await fs.readFile(logPath, 'utf8')
  } catch {
    return
  }

  const entries = raw
    .split('\n')
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as Record<string, unknown> } catch { return null } })
    .filter((e): e is Record<string, unknown> => !!e && e.requestId === requestId)

  if (entries.length === 0) return

  const already = await prisma.auditLog.count({
    where: { entidade: 'AtualizacaoSistema', entidadeId: updateId, acao: 'UPDATE_LOG' },
  })
  const newEntries = entries.slice(already)
  if (newEntries.length === 0) return

  await prisma.auditLog.createMany({
    data: newEntries.map((e) => ({
      acao: 'UPDATE_LOG',
      entidade: 'AtualizacaoSistema',
      entidadeId: updateId,
      utilizadorId: '__daemon__',
      // `createdAt` uses the daemon timestamp so the log appears in
      // chronological order even when synced in a batch.
      createdAt: typeof e.t === 'string' ? new Date(e.t) : new Date(),
      detalhes: { msg: typeof e.msg === 'string' ? e.msg : String(e.msg) },
    })),
  })
}

/**
 * Força a transição de um update preso para FAILED, independentemente do
 * estado actual. Apenas para ADMINISTRACAO (a rota valida o papel antes de
 * chamar esta função). Limpa os ficheiros de controlo e desativa o modo de
 * manutenção.
 */
export async function forceAbortUpdate(id: string, userId: string): Promise<void> {
  const row = await prisma.atualizacaoSistema.findUnique({ where: { id } })
  if (!row) {
    const e = new Error('Atualização não encontrada')
    ;(e as Error & { cause?: number }).cause = 404
    throw e
  }
  const state = row.state as UpdateState
  if (isTerminal(state)) {
    const e = new Error('A atualização já se encontra num estado terminal')
    ;(e as Error & { cause?: number }).cause = 409
    throw e
  }

  // Sync any remaining daemon logs before we mark it FAILED.
  await syncDaemonLogs(id, row.requestId).catch(() => {})

  await prisma.atualizacaoSistema.update({
    where: { id },
    data: {
      state: 'FAILED',
      finishedAt: new Date(),
      errorMessage: `Abortada manualmente (estava em ${state})`,
    },
  })

  await cleanupControlFiles()

  await prisma.configuracaoSistema.update({
    where: { id: 'singleton' },
    data: { maintenanceMode: false },
  })

  await prisma.auditLog.create({
    data: {
      acao: 'UPDATE_FORCE_ABORTED',
      entidade: 'AtualizacaoSistema',
      entidadeId: id,
      utilizadorId: userId,
      detalhes: { previousState: state },
    },
  })

  log.warn({ id, userId, previousState: state }, 'Update abortado por força')
}
