import { NextRequest } from 'next/server'
import { timingSafeEqual, createHash } from 'crypto'
import { runAutoTransicoes } from '@/lib/auto-transicao'
import { childLogger } from '@/lib/logger'

const log = childLogger({ subsystem: 'cron/auto-transicao' })

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
 * Transições automáticas de estado por inatividade. O worker (node-cron) já
 * corre isto diariamente; este endpoint existe para deployments que usem um
 * cron externo (mesma auth por CRON_SECRET dos restantes /api/cron).
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runAutoTransicoes()
    return Response.json(result)
  } catch (error) {
    log.error({ err: error }, 'auto-transicao route failed')
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
