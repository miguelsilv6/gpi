import { NextRequest } from 'next/server'
import { timingSafeEqual, createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { createNotification, notifyAtividadePrazo } from '@/lib/notifications'

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

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const config = await prisma.configuracaoSistema.findUnique({ where: { id: 'singleton' } })
    const alertDays = config?.prazoAlertaDias ?? 7

    const threshold = new Date()
    threshold.setDate(threshold.getDate() + alertDays)

    const now = new Date()

    // ── 1. Inquérito deadlines ─────────────────────────────────────────────────
    const [approaching, overdue] = await Promise.all([
      prisma.inquerito.findMany({
        where: {
          dataPrazo: { gte: now, lte: threshold },
          estado: { terminal: false },
          inspetorId: { not: null },
        },
        include: { inspetor: { select: { id: true, email: true } } },
      }),
      prisma.inquerito.findMany({
        where: {
          dataPrazo: { lt: now },
          estado: { terminal: false },
          inspetorId: { not: null },
        },
        include: { inspetor: { select: { id: true, email: true } } },
      }),
    ])

    const jobs: Promise<unknown>[] = []

    for (const inq of approaching) {
      if (!inq.inspetorId || !inq.inspetor) continue
      jobs.push(
        createNotification({
          utilizadorId: inq.inspetorId,
          tipo: 'PRAZO_APROXIMANDO',
          titulo: `Prazo a aproximar — ${inq.nuipc}`,
          mensagem: `O prazo do inquérito ${inq.nuipc} vence em breve.`,
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

    // ── 2. Activity deadlines ──────────────────────────────────────────────────
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    // Only fetch activities with a deadline not yet passed and at least one alert set
    const atividadesComPrazo = await prisma.atividade.findMany({
      where: {
        dataPrazo: { not: null, gte: today },
        OR: [
          { alertaDias1: { not: null }, alerta1Enviado: false },
          { alertaDias2: { not: null }, alerta2Enviado: false },
        ],
      },
      include: {
        inquerito: { select: { id: true, nuipc: true } },
        realizadaPor: { select: { id: true, email: true } },
      },
    })

    for (const atv of atividadesComPrazo) {
      if (!atv.dataPrazo) continue
      const prazoDay = new Date(atv.dataPrazo)
      prazoDay.setHours(0, 0, 0, 0)
      const diasRestantes = Math.round((prazoDay.getTime() - today.getTime()) / 86_400_000)

      // First alert
      if (atv.alertaDias1 != null && !atv.alerta1Enviado && diasRestantes <= atv.alertaDias1) {
        jobs.push(
          notifyAtividadePrazo({
            descricao: atv.descricao,
            inqueritoid: atv.inquerito.id,
            nuipc: atv.inquerito.nuipc,
            utilizadorId: atv.realizadaPor.id,
            utilizadorEmail: atv.realizadaPor.email,
            diasRestantes,
            alertaNum: 1,
          }).then(() =>
            prisma.atividade.update({ where: { id: atv.id }, data: { alerta1Enviado: true } })
          )
        )
      }

      // Second alert
      if (atv.alertaDias2 != null && !atv.alerta2Enviado && diasRestantes <= atv.alertaDias2) {
        jobs.push(
          notifyAtividadePrazo({
            descricao: atv.descricao,
            inqueritoid: atv.inquerito.id,
            nuipc: atv.inquerito.nuipc,
            utilizadorId: atv.realizadaPor.id,
            utilizadorEmail: atv.realizadaPor.email,
            diasRestantes,
            alertaNum: 2,
          }).then(() =>
            prisma.atividade.update({ where: { id: atv.id }, data: { alerta2Enviado: true } })
          )
        )
      }
    }

    await Promise.allSettled(jobs)

    return Response.json({
      inqueritos: { approaching: approaching.length, overdue: overdue.length },
      atividades: atividadesComPrazo.length,
      notified: jobs.length,
    })
  } catch (error) {
    console.error('[cron/deadline-check]', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
