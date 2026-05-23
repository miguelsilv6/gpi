import cron, { type ScheduledTask } from 'node-cron'
import { prisma } from '@/lib/prisma'
import {
  createNotification,
  notifyBackupFailed,
  notifyUpdateFailed,
  notifyUpdateConcluida,
} from '@/lib/notifications'
import { childLogger } from '@/lib/logger'
import { spawnSync } from 'child_process'
import { fetchLatestRelease, isNewerVersion } from '@/lib/updates/github'
import { reconcileFromStatusFile } from '@/lib/updates/orchestrator'
import { isTerminal, type UpdateState } from '@/lib/updates/state-machine'
import { APP_VERSION } from '@/lib/version'

const log = childLogger({ subsystem: 'cron' })

const BACKUP_DIR = process.env.BACKUP_DIR ?? '/app/backups'
// Caminho relativo a partir do CWD do worker (gpi_worker tem WORKDIR /app)
const BACKUP_SCRIPT = 'scripts/backup.sh'

// State module-level: a task de backup actualmente registada + a sua cron string.
// O tick por minuto compara a string em DB com esta e re-agenda se mudou.
let backupTask: ScheduledTask | null = null
let backupCron: string | null = null

export function startCronJobs() {
  // Deadline check — corrida agendada estática (alertaDias é parametrizado
  // dentro da rotina, não no schedule).
  cron.schedule('0 8 * * *', async () => {
    log.info('Running deadline check')
    try {
      await runDeadlineCheck()
    } catch (err) {
      log.error({ err }, 'Deadline check failed')
    }
  })

  // Inicializa a task de backup imediatamente + um tick por minuto para
  // re-agendar quando o operador muda o schedule em /configurações.
  void reloadBackupSchedule()
  cron.schedule('* * * * *', () => {
    void reloadBackupSchedule()
  })

  // Verificação periódica de atualizações: a cada 30 minutos + uma corrida
  // imediata para popular o cache em primeiro boot.
  void runUpdateCheck()
  cron.schedule('*/30 * * * *', () => {
    void runUpdateCheck()
  })

  // Reconciliador do ficheiro de status (escrito pelo host daemon) com a
  // tabela `AtualizacaoSistema`. Tick a cada 5 segundos. Sai cedo quando não
  // há nenhum update não-terminal, para evitar I/O desnecessário.
  cron.schedule('*/5 * * * * *', () => {
    void runUpdateReconciler()
  })

  log.info(
    'Jobs registered: deadline check @ 08:00 daily; backup (DB-driven, auto-reload @ 1 min); update check @ 30 min; update reconciler @ 5s',
  )
}

/**
 * Lê `backupScheduleCron` da BD e re-agenda o job se mudou. Idempotente —
 * pode ser chamado sempre que o tick fire sem custo se nada muda.
 */
async function reloadBackupSchedule() {
  let cronString: string
  try {
    const config = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { backupScheduleCron: true },
    })
    cronString = config?.backupScheduleCron ?? '0 2 * * *'
  } catch (err) {
    log.error({ err }, 'Não foi possível ler backupScheduleCron')
    return
  }

  if (cronString === backupCron && backupTask) return
  if (!cron.validate(cronString)) {
    log.error({ cronString }, 'backupScheduleCron inválida — ignorada')
    return
  }

  if (backupTask) {
    backupTask.stop()
    backupTask = null
  }
  backupCron = cronString
  backupTask = cron.schedule(cronString, () => {
    void runScheduledBackup()
  })
  log.info({ cronString }, 'Backup agendado')
}

/**
 * Versão "agendada" — invoca runBackup com auditing e notificação em falha.
 * Usado pelo node-cron tick; o endpoint manual chama runBackup directamente
 * com `source: 'manual'`.
 */
async function runScheduledBackup() {
  try {
    const filename = await runBackup({ source: 'agendado' })
    log.info({ filename }, 'Backup agendado OK')
  } catch (err) {
    log.error({ err }, 'Backup agendado falhou')
    // notifyBackupFailed já foi chamado por runBackup no catch
  }
}

interface RunBackupOpts {
  /** Onde guardar — útil para sub-pastas de teste. */
  backupDir?: string
  /** Prefixo do filename, e.g. 'gpi_prerestore_' para snapshots pre-restauro. */
  prefix?: string
  /** Source label para o audit. */
  source: 'agendado' | 'manual' | 'pre_restauro'
  /** Override da retenção (default 30; usar 5 para pre-restauro). */
  retention?: number
  /** Quando set, escreve o audit log atribuído a este utilizador. */
  utilizadorId?: string
}

/**
 * Corre o script de backup e devolve o filename gerado. Em falha:
 *   - regista audit BACKUP_FAILED com o erro
 *   - notifica utilizadores ADMINISTRACAO
 *   - propaga o erro (o caller pode capturar conforme contexto)
 */
export async function runBackup(opts: RunBackupOpts): Promise<string> {
  const env = {
    ...process.env,
    BACKUP_DIR: opts.backupDir ?? BACKUP_DIR,
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    ...(opts.prefix ? { BACKUP_PREFIX: opts.prefix } : {}),
    ...(opts.retention ? { BACKUP_RETENTION: String(opts.retention) } : {}),
  } as NodeJS.ProcessEnv

  const start = Date.now()
  const result = spawnSync('bash', [BACKUP_SCRIPT], {
    env,
    encoding: 'utf8',
  })
  const durationMs = Date.now() - start

  if (result.status !== 0) {
    const stderr = result.stderr || result.stdout || result.error?.message || 'erro desconhecido'
    // Audit + notificação
    try {
      await prisma.auditLog.create({
        data: {
          acao: 'BACKUP_FAILED',
          entidade: 'Sistema',
          entidadeId: 'backup',
          utilizadorId: opts.utilizadorId ?? '__system__',
          detalhes: {
            source: opts.source,
            exitCode: result.status,
            durationMs,
            stderr: stderr.slice(0, 2000),
          } as never,
        },
      })
    } catch {
      // não bloquear no audit
    }
    try {
      await notifyBackupFailed({
        contexto: opts.source === 'agendado' ? 'backup_agendado' : 'backup_manual',
        error: stderr,
      })
    } catch {
      // não bloquear na notificação
    }
    throw new Error(`backup.sh exit ${result.status}: ${stderr.slice(0, 200)}`)
  }

  // O script emite o filename na última linha do stdout.
  const lines = (result.stdout || '').trim().split('\n')
  const filename = lines[lines.length - 1] ?? ''

  // Audit success
  try {
    await prisma.auditLog.create({
      data: {
        acao: 'CREATE_BACKUP',
        entidade: 'Sistema',
        entidadeId: filename || 'backup',
        utilizadorId: opts.utilizadorId ?? '__system__',
        detalhes: {
          source: opts.source,
          filename,
          durationMs,
        } as never,
      },
    })
  } catch {
    // não bloquear no audit
  }

  return filename
}

/**
 * Consulta GitHub Releases e cache o resultado em `ConfiguracaoSistema`.
 * Falhas de rede não bloqueiam a app — o valor anterior fica "sticky".
 */
async function runUpdateCheck(): Promise<void> {
  try {
    const release = await fetchLatestRelease()
    if (!release) {
      // Mesmo sem release válida, atualizamos o timestamp para o UI mostrar
      // "última verificação" recente.
      await prisma.configuracaoSistema.update({
        where: { id: 'singleton' },
        data: { latestVersionCheckedAt: new Date() },
      })
      return
    }
    await prisma.configuracaoSistema.update({
      where: { id: 'singleton' },
      data: {
        latestVersionTag: release.tag,
        latestVersionUrl: release.url,
        latestVersionNotes: release.notes,
        latestVersionCheckedAt: new Date(),
      },
    })
    if (isNewerVersion(release.tag, APP_VERSION)) {
      log.info(
        { current: APP_VERSION, available: release.tag },
        'Nova versão disponível',
      )
    }
  } catch (err) {
    log.error({ err }, 'Update check falhou')
  }
}

/**
 * Reflete o ficheiro de status escrito pelo host daemon na tabela
 * `AtualizacaoSistema`. Quando deteta uma transição para um estado terminal,
 * envia a notificação correspondente.
 */
async function runUpdateReconciler(): Promise<void> {
  try {
    // Optimização: se não há nada em curso, salta o read do filesystem.
    const inFlight = await prisma.atualizacaoSistema.findFirst({
      where: { finishedAt: null },
      orderBy: { startedAt: 'desc' },
    })
    if (!inFlight) return

    const prevState = inFlight.state as UpdateState
    await reconcileFromStatusFile()

    const fresh = await prisma.atualizacaoSistema.findUnique({
      where: { id: inFlight.id },
    })
    if (!fresh) return
    const newState = fresh.state as UpdateState
    if (newState === prevState) return
    if (!isTerminal(newState)) return

    const durationMs =
      fresh.finishedAt && fresh.startedAt
        ? fresh.finishedAt.getTime() - fresh.startedAt.getTime()
        : 0

    if (newState === 'DONE') {
      await notifyUpdateConcluida({
        fromVersion: fresh.fromVersion,
        toVersion: fresh.toVersion,
        durationMs,
      })
    } else if (newState === 'ROLLED_BACK') {
      await notifyUpdateFailed({
        fromVersion: fresh.fromVersion,
        toVersion: fresh.toVersion,
        phase: prevState,
        error: fresh.errorMessage ?? 'desconhecido',
        rolledBack: true,
      })
    } else if (newState === 'FAILED') {
      await notifyUpdateFailed({
        fromVersion: fresh.fromVersion,
        toVersion: fresh.toVersion,
        phase: prevState,
        error: fresh.errorMessage ?? 'desconhecido',
        rolledBack: false,
      })
    }
  } catch (err) {
    log.error({ err }, 'Update reconciler falhou')
  }
}

async function runDeadlineCheck() {
  const config = await prisma.configuracaoSistema.findUnique({ where: { id: 'singleton' } })
  const alertDays = config?.prazoAlertaDias ?? 7

  const threshold = new Date()
  threshold.setDate(threshold.getDate() + alertDays)

  // Find inquiries with deadline approaching (within alertDays) not yet completed
  const approaching = await prisma.inquerito.findMany({
    where: {
      dataPrazo: { gte: new Date(), lte: threshold },
      estado: { terminal: false },
      inspetorId: { not: null },
    },
    include: { inspetor: { select: { id: true, email: true } } },
  })

  // Find overdue inquiries
  const overdue = await prisma.inquerito.findMany({
    where: {
      dataPrazo: { lt: new Date() },
      estado: { terminal: false },
      inspetorId: { not: null },
    },
    include: { inspetor: { select: { id: true, email: true } } },
  })

  const jobs: Promise<unknown>[] = []

  for (const inq of approaching) {
    if (!inq.inspetorId || !inq.inspetor) continue
    jobs.push(
      createNotification({
        utilizadorId: inq.inspetorId,
        tipo: 'PRAZO_APROXIMANDO',
        titulo: `Prazo a aproximar — ${inq.nuipc}`,
        mensagem: `O prazo do inquérito ${inq.nuipc} vence em breve (${inq.dataPrazo?.toLocaleDateString('pt-PT')}).`,
        inqueritoid: inq.id,
        sendEmail: true,
        emailAddress: inq.inspetor.email,
      }),
    )
  }

  for (const inq of overdue) {
    if (!inq.inspetorId || !inq.inspetor) continue
    jobs.push(
      createNotification({
        utilizadorId: inq.inspetorId,
        tipo: 'PRAZO_ULTRAPASSADO',
        titulo: `Prazo ultrapassado — ${inq.nuipc}`,
        mensagem: `O prazo do inquérito ${inq.nuipc} foi ultrapassado.`,
        inqueritoid: inq.id,
        sendEmail: true,
        emailAddress: inq.inspetor.email,
      }),
    )
  }

  await Promise.allSettled(jobs)
  log.info(
    { approaching: approaching.length, overdue: overdue.length },
    'Deadline check completed',
  )
}

