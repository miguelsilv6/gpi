import cron, { type ScheduledTask } from 'node-cron'
import { prisma } from '@/lib/prisma'
import {
  createNotification,
  notifyBackupFailed,
  notifyUpdateFailed,
  notifyUpdateConcluida,
  escalateOverdueToChefes,
  escalateUrgentToChefes,
} from '@/lib/notifications'
import { childLogger } from '@/lib/logger'
import { spawn } from 'child_process'
import { fetchLatestRelease, isNewerVersion } from '@/lib/updates/github'
import { reconcileFromStatusFile, processAvailableUpdates } from '@/lib/updates/orchestrator'
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
let backupRetencaoCached = 30

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

  // Dispatcher de updates em fila: pega em linhas AVAILABLE e executa o
  // backup pré-atualização (potencialmente vários minutos). Tick a cada
  // 10s. Promise não-awaited para não bloquear futuros ticks; flock no
  // backup.sh + state machine recusam dupla execução.
  cron.schedule('*/10 * * * * *', () => {
    void runUpdateDispatcher()
  })

  log.info(
    'Jobs registered: deadline check @ 08:00 daily; backup (DB-driven, auto-reload @ 1 min); update check @ 30 min; update reconciler @ 5s; update dispatcher @ 10s',
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
      select: { backupScheduleCron: true, backupRetencao: true },
    })
    cronString = config?.backupScheduleCron ?? '0 2 * * *'
    backupRetencaoCached = config?.backupRetencao ?? 30
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
    const filename = await runBackup({ source: 'agendado', retention: backupRetencaoCached })
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
interface BackupRunResult {
  status: number | null
  stdout: string
  stderr: string
  errorMessage: string | null
}

/**
 * Wrapper async em torno de `spawn` — devolve quando o processo termina
 * sem bloquear o event loop. Substitui `spawnSync` que bloqueava o worker
 * durante minutos em backups de BDs grandes.
 */
function runBackupProcess(env: NodeJS.ProcessEnv): Promise<BackupRunResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let errorMessage: string | null = null
    const child = spawn('bash', [BACKUP_SCRIPT], { env })
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', (err) => { errorMessage = err.message })
    child.on('close', (status) => {
      resolve({ status, stdout, stderr, errorMessage })
    })
  })
}

export async function runBackup(opts: RunBackupOpts): Promise<string> {
  const env = {
    ...process.env,
    BACKUP_DIR: opts.backupDir ?? BACKUP_DIR,
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    ...(opts.prefix ? { BACKUP_PREFIX: opts.prefix } : {}),
    ...(opts.retention ? { BACKUP_RETENTION: String(opts.retention) } : {}),
  } as NodeJS.ProcessEnv

  const start = Date.now()
  const result = await runBackupProcess(env)
  const durationMs = Date.now() - start

  if (result.status !== 0) {
    const stderr = result.stderr || result.stdout || result.errorMessage || 'erro desconhecido'
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
/**
 * Pega em atualizações enfileiradas em AVAILABLE e executa o backup
 * pré-atualização + escreve o ficheiro de trigger. Corre num tick para que
 * o handler HTTP de /api/updates/start possa devolver 202 imediatamente.
 */
async function runUpdateDispatcher(): Promise<void> {
  try {
    await processAvailableUpdates()
  } catch (err) {
    log.error({ err }, 'Update dispatcher falhou')
  }
}

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

// Exportada para os testes de integração poderem exercitar o deadline-check
// diretamente (sem agendar o worker).
export async function runDeadlineCheck() {
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

  // Escalar os vencidos ao Inspetor-Chefe da brigada (para além do inspetor).
  jobs.push(escalateOverdueToChefes(overdue))

  // Limiar "urgente" opcional: prazos a aproximar-se ainda mais (≤ urgentDays)
  // são também escalados ao Inspetor-Chefe da brigada.
  const urgentDays = config?.prazoAlertaDiasUrgente ?? null
  let urgentCount = 0
  if (urgentDays != null) {
    const urgentThreshold = new Date()
    urgentThreshold.setDate(urgentThreshold.getDate() + urgentDays)
    const urgent = approaching.filter((inq) => inq.dataPrazo && inq.dataPrazo <= urgentThreshold)
    urgentCount = urgent.length
    jobs.push(escalateUrgentToChefes(urgent))
  }

  // ── Controlos: alert before each upcoming realizacao ──────────────────────
  // No global threshold here — each controlo carries its own alertaDias, so
  // we load all unalerted pending realizacoes and filter in-process.
  // Cap the DB query at 90 days (max allowed alertaDias) so the result set
  // stays bounded even with many future recurring realizacoes.
  const maxThreshold = new Date()
  maxThreshold.setDate(maxThreshold.getDate() + 90)

  const pendingRealizacoes = await prisma.controloRealizacao.findMany({
    where: {
      dataRealizacao: null,
      alertaEnviado: false,
      dataEsperada: { lte: maxThreshold },
      controlo: {
        concluidoEm: null,
        // Skip alerts for controlos linked to deleted or terminal inquiries
        OR: [
          { inqueritoid: null },
          { inquerito: { deletedAt: null, estado: { terminal: false } } },
        ],
      },
    },
    include: {
      controlo: {
        include: {
          criador: { select: { id: true, email: true, nome: true } },
          inquerito: { select: { nuipc: true } },
        },
      },
    },
  })

  const today = new Date()
  let controlosAlertas = 0
  for (const realizacao of pendingRealizacoes) {
    const { controlo } = realizacao
    // Use per-controlo alertaDias — each controlo can have a different lead time.
    const threshold = new Date(today)
    threshold.setDate(threshold.getDate() + controlo.alertaDias)
    const dataEsperada = realizacao.dataEsperada instanceof Date
      ? realizacao.dataEsperada
      : new Date(realizacao.dataEsperada as string)
    if (dataEsperada > threshold) continue
    controlosAlertas++
    const nuipcLabel = controlo.inquerito ? ` — ${controlo.inquerito.nuipc}` : ''
    jobs.push(
      createNotification({
        utilizadorId: controlo.criadorId,
        tipo: 'CONTROLO_APROXIMANDO',
        titulo: `${realizacao.numero}.º Controlo a aproximar${nuipcLabel}`,
        mensagem: `${controlo.descricao}: ${realizacao.numero}.º controlo previsto para ${new Date(realizacao.dataEsperada).toLocaleDateString('pt-PT', { timeZone: 'UTC' })}.`,
        sendEmail: true,
        emailAddress: controlo.criador.email,
      }).then(() =>
        prisma.controloRealizacao.update({
          where: { id: realizacao.id },
          data: { alertaEnviado: true },
        }),
      ),
    )
  }

  await Promise.allSettled(jobs)
  log.info(
    {
      approaching: approaching.length,
      overdue: overdue.length,
      urgent: urgentCount,
      controlos: controlosAlertas,
    },
    'Deadline check completed',
  )
}
