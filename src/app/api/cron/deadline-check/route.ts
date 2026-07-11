import { NextRequest } from 'next/server'
import { timingSafeEqual, createHash } from 'crypto'
import { runDeadlineChecks } from '@/lib/deadline-checks'
import { childLogger } from '@/lib/logger'

const log = childLogger({ subsystem: 'cron/deadline-check' })

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const provided = req.headers.get('x-cron-secret') ?? ''
  try {
    const a = createHash('sha256').update(secret).digest()
    const b = createHash('sha256').update(provided).digest()
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Disparo manual/externo da verificação de prazos. Corre exatamente a mesma
 * lógica que o worker agendado (`runDeadlineChecks` — inquéritos, atividades,
 * controlos e interceções); ver src/lib/deadline-checks.ts.
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runDeadlineChecks(new Date())
    return Response.json({
      inqueritos: { approaching: summary.approaching, overdue: summary.overdue },
      urgent: summary.urgent,
      atividades: summary.atividades,
      controlos: summary.controlos,
      intercecoes: summary.intercecoes,
    })
  } catch (error) {
    log.error({ err: error }, 'deadline-check route failed')
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
