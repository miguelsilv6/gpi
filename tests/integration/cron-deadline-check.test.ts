import { describe, test, expect, beforeEach, afterAll } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeUtilizador, makeBrigada, makeEstado, makeInquerito } from '../helpers/fixtures'
import { runDeadlineCheck } from '@/lib/cron'
import { invalidatePolicyCache } from '@/lib/notifications'
import { TipoNotificacao } from '@/generated/prisma/enums'

/**
 * Testes end-to-end do deadline-check do cron: alertas de prazos de
 * inquéritos e de controlos. Regressão principal: o limiar de alerta dos
 * controlos é o `alertaDias` de CADA controlo, não o prazoAlertaDias global.
 */

process.env.DISABLE_EMAIL = 'true'

const prisma = getTestPrisma()

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

async function makeControlo(args: {
  criadorId: string
  alertaDias: number
  dataEsperada: Date
  descricao?: string
}) {
  const controlo = await prisma.controlo.create({
    data: {
      descricao: args.descricao ?? 'Controlo teste',
      dataInicio: args.dataEsperada,
      alertaDias: args.alertaDias,
      criadorId: args.criadorId,
    },
  })
  const realizacao = await prisma.controloRealizacao.create({
    data: {
      controloId: controlo.id,
      numero: 1,
      dataEsperada: args.dataEsperada,
    },
  })
  return { controlo, realizacao }
}

beforeEach(async () => {
  await resetDatabase(prisma)
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Controlo", "ControloRealizacao" RESTART IDENTITY CASCADE',
  )
  // applyPolicy é fail-closed: sem policy não há notificação. Semear todas
  // com in-app ativo (como faz o seed de produção).
  for (const tipo of Object.values(TipoNotificacao)) {
    await prisma.notificationPolicy.create({
      data: { tipo, inAppEnabled: true, emailEnabled: false, ccRoles: [] },
    })
  }
  invalidatePolicyCache()
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('runDeadlineCheck — controlos', () => {
  test('alerta quando a dataEsperada cai dentro do alertaDias do controlo', async () => {
    const user = await makeUtilizador(prisma)
    const { realizacao } = await makeControlo({
      criadorId: user.id,
      alertaDias: 7,
      dataEsperada: daysFromNow(5),
    })

    await runDeadlineCheck()

    const notifs = await prisma.notificacao.findMany({
      where: { utilizadorId: user.id, tipo: 'CONTROLO_APROXIMANDO' },
    })
    expect(notifs).toHaveLength(1)

    const updated = await prisma.controloRealizacao.findUnique({ where: { id: realizacao.id } })
    expect(updated?.alertaEnviado).toBe(true)
  })

  test('NÃO alerta quando a dataEsperada está fora do alertaDias do controlo', async () => {
    const user = await makeUtilizador(prisma)
    const { realizacao } = await makeControlo({
      criadorId: user.id,
      alertaDias: 3,
      dataEsperada: daysFromNow(10),
    })

    await runDeadlineCheck()

    const notifs = await prisma.notificacao.findMany({
      where: { utilizadorId: user.id, tipo: 'CONTROLO_APROXIMANDO' },
    })
    expect(notifs).toHaveLength(0)

    const updated = await prisma.controloRealizacao.findUnique({ where: { id: realizacao.id } })
    expect(updated?.alertaEnviado).toBe(false)
  })

  test('usa o alertaDias DO CONTROLO, não o prazoAlertaDias global (regressão)', async () => {
    // Config global apertada (3 dias) mas o controlo pede 30 dias de antecedência.
    await prisma.configuracaoSistema.create({
      data: { id: 'singleton', prazoAlertaDias: 3 },
    })
    const user = await makeUtilizador(prisma)
    await makeControlo({
      criadorId: user.id,
      alertaDias: 30,
      dataEsperada: daysFromNow(10),
    })

    await runDeadlineCheck()

    const notifs = await prisma.notificacao.findMany({
      where: { utilizadorId: user.id, tipo: 'CONTROLO_APROXIMANDO' },
    })
    // Com o limiar global (3d) isto nunca dispararia; com o per-controlo (30d) dispara.
    expect(notifs).toHaveLength(1)
  })

  test('não alerta duas vezes para a mesma realização', async () => {
    const user = await makeUtilizador(prisma)
    await makeControlo({
      criadorId: user.id,
      alertaDias: 7,
      dataEsperada: daysFromNow(2),
    })

    await runDeadlineCheck()
    await runDeadlineCheck()

    const notifs = await prisma.notificacao.findMany({
      where: { utilizadorId: user.id, tipo: 'CONTROLO_APROXIMANDO' },
    })
    expect(notifs).toHaveLength(1)
  })

  test('ignora controlos de inquéritos em estado terminal', async () => {
    const brigada = await makeBrigada(prisma)
    const terminal = await makeEstado(prisma, { codigo: 'CONCLUIDO', terminal: true })
    const user = await makeUtilizador(prisma, { brigadaId: brigada.id })
    const inq = await makeInquerito(prisma, {
      estadoId: terminal.id,
      brigadaId: brigada.id,
      inspetorId: user.id,
    })

    const controlo = await prisma.controlo.create({
      data: {
        descricao: 'Controlo em terminal',
        dataInicio: daysFromNow(1),
        alertaDias: 7,
        criadorId: user.id,
        inqueritoid: inq.id,
      },
    })
    await prisma.controloRealizacao.create({
      data: { controloId: controlo.id, numero: 1, dataEsperada: daysFromNow(1) },
    })

    await runDeadlineCheck()

    const notifs = await prisma.notificacao.findMany({
      where: { tipo: 'CONTROLO_APROXIMANDO' },
    })
    expect(notifs).toHaveLength(0)
  })
})

describe('runDeadlineCheck — prazos de inquéritos', () => {
  test('alerta o inspetor de prazo a aproximar-se (dentro de prazoAlertaDias)', async () => {
    const brigada = await makeBrigada(prisma)
    const estado = await makeEstado(prisma, { codigo: 'ABERTO' })
    const inspetor = await makeUtilizador(prisma, { brigadaId: brigada.id })
    const inq = await makeInquerito(prisma, {
      estadoId: estado.id,
      brigadaId: brigada.id,
      inspetorId: inspetor.id,
    })
    await prisma.inquerito.update({
      where: { id: inq.id },
      data: { dataPrazo: daysFromNow(3) },
    })

    await runDeadlineCheck()

    const notifs = await prisma.notificacao.findMany({
      where: { utilizadorId: inspetor.id, tipo: 'PRAZO_APROXIMANDO' },
    })
    expect(notifs).toHaveLength(1)
  })

  test('alerta de prazo ultrapassado', async () => {
    const brigada = await makeBrigada(prisma)
    const estado = await makeEstado(prisma, { codigo: 'ABERTO' })
    const inspetor = await makeUtilizador(prisma, { brigadaId: brigada.id })
    const inq = await makeInquerito(prisma, {
      estadoId: estado.id,
      brigadaId: brigada.id,
      inspetorId: inspetor.id,
    })
    await prisma.inquerito.update({
      where: { id: inq.id },
      data: { dataPrazo: daysFromNow(-2) },
    })

    await runDeadlineCheck()

    const notifs = await prisma.notificacao.findMany({
      where: { utilizadorId: inspetor.id, tipo: 'PRAZO_ULTRAPASSADO' },
    })
    expect(notifs).toHaveLength(1)
  })
})
