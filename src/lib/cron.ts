import cron from 'node-cron'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications'
import { execSync } from 'child_process'

export function startCronJobs() {
  // Deadline check: daily at 08:00
  cron.schedule('0 8 * * *', async () => {
    console.log('[cron] Running deadline check...')
    try {
      await runDeadlineCheck()
    } catch (err) {
      console.error('[cron] Deadline check failed:', err)
    }
  })

  console.log('[cron] Jobs registered: deadline check @ 08:00 daily')
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
  console.log(`[cron] Deadline check: ${approaching.length} approaching, ${overdue.length} overdue`)
}

export async function runBackup() {
  const backupDir = process.env.BACKUP_DIR ?? '/backups'
  console.log('[cron] Running backup...')
  try {
    execSync(`BACKUP_DIR=${backupDir} DATABASE_URL=${process.env.DATABASE_URL} bash scripts/backup.sh`, {
      stdio: 'inherit',
    })
    console.log('[cron] Backup complete')
  } catch (err) {
    console.error('[cron] Backup failed:', err)
  }
}
