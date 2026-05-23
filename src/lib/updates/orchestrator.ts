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
 * Inicia uma atualização. Chamada pelo handler POST /api/updates/start.
 *
 * Garantias:
 *  - Recusa se já existir uma atualização em curso (linha não-terminal).
 *  - Recusa downgrade (`targetTag` <= versão atual).
 *  - Reutiliza linha existente se o `requestId` (idempotency key) já foi visto.
 *  - Backup obrigatório antes de qualquer escrita de trigger.
 *  - Modo de manutenção ligado antes do backup; só é desligado pelo host
 *    daemon após HEALTHCHECK ok (ou pelo path de rollback em sucesso).
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

  // Recusa se há outra atualização em curso.
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

  // Cria a linha em AVAILABLE → BACKING_UP (ainda numa única transação lógica
  // do ponto de vista do utilizador, mas em duas escritas para que o ID
  // exista antes do backup, no caso de o backup demorar muito).
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
      acao: 'UPDATE_STARTED',
      entidade: 'AtualizacaoSistema',
      entidadeId: row.id,
      utilizadorId: opts.userId,
      detalhes: { fromVersion, toVersion, fromSha, requestId } as never,
    },
  })

  // Ligar modo de manutenção. Não-admins veem 503 a partir daqui.
  await prisma.configuracaoSistema.update({
    where: { id: 'singleton' },
    data: { maintenanceMode: true },
  })

  // Transitar para BACKING_UP e correr o backup. Se falhar, marcar FAILED e
  // libertar manutenção — nada de destrutivo foi feito ainda.
  await updateState(row.id, 'AVAILABLE', 'BACKING_UP')
  let backupFilename: string
  try {
    backupFilename = await runBackup({
      source: 'pre_restauro',
      prefix: 'gpi_prerestore_',
      retention: 10,
      utilizadorId: opts.userId,
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
        utilizadorId: opts.userId,
        detalhes: { phase: 'BACKING_UP', error: msg } as never,
      },
    })
    throw err
  }

  await prisma.atualizacaoSistema.update({
    where: { id: row.id },
    data: { preBackupFile: backupFilename },
  })

  // Transitar para PULLING e escrever trigger para o host daemon.
  await updateState(row.id, 'BACKING_UP', 'PULLING')
  const trigger: UpdateTrigger = {
    requestId,
    fromSha,
    fromVersion,
    toTag: opts.targetTag,
    preBackupFile: backupFilename,
    issuedAt: new Date().toISOString(),
  }
  await writeJsonFile(TRIGGER_FILE, trigger)
  // Escrita inicial de status, para que o UI veja PULLING imediatamente
  // mesmo antes do daemon picar o trigger.
  await writeJsonFile(STATUS_FILE, {
    requestId,
    state: 'PULLING',
    updatedAt: new Date().toISOString(),
  } satisfies UpdateStatus)

  return { id: row.id }
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
      detalhes: { from, to, ...extra } as never,
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
      detalhes: { from: current, to: next, source: 'reconciler' } as never,
    },
  })

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
  for (const f of [TRIGGER_FILE, STATUS_FILE]) {
    try {
      await fs.unlink(path.join(CONTROL_DIR, f))
    } catch {
      // ENOENT é o caso normal — ignorar
    }
  }
}
