import { describe, test, expect, beforeEach, afterAll } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { checkIntercecoesATerminar, getLinhasGlobal } from '@/lib/intercecoes'
import { resetAlertFlagsOnUpdate } from '@/lib/validations/intercecao'
import { invalidatePolicyCache } from '@/lib/notifications'
import { TipoNotificacao } from '@/generated/prisma/enums'

/**
 * Interceções: scope RBAC da lista global, motor de alertas de fim de linha
 * (idempotência, dois avisos, vencidas, soft-delete, reset de flags) e o
 * cascade alvo → linhas/produtos.
 */

process.env.DISABLE_EMAIL = 'true'

const prisma = getTestPrisma()

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

async function makeAlvoComLinha(args: {
  inqueritoid: string
  codigo?: string
  nome?: string
  dataFim: Date
  alertaDias1?: number | null
  alertaDias2?: number | null
}) {
  const alvo = await prisma.intercecaoAlvo.create({
    data: {
      nome: args.nome ?? 'Suspeito Teste',
      codigo: args.codigo ?? '123',
      inqueritoid: args.inqueritoid,
    },
  })
  const linha = await prisma.intercecaoLinha.create({
    data: {
      alvoId: alvo.id,
      tipo: 'SIM',
      identificador: '912345678',
      rede: 'MEO',
      dataInicio: daysFromNow(-30),
      dataFim: args.dataFim,
      alertaDias1: args.alertaDias1 === undefined ? 10 : args.alertaDias1,
      alertaDias2: args.alertaDias2 === undefined ? 3 : args.alertaDias2,
    },
  })
  return { alvo, linha }
}

beforeEach(async () => {
  await resetDatabase(prisma)
  // applyPolicy é fail-closed: sem policy não há notificação.
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

describe('getLinhasGlobal — scope RBAC', () => {
  test('cada role vê apenas as linhas dos inquéritos no seu âmbito', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: daysFromNow(20) })

    const paraInspetorA = await getLinhasGlobal({
      role: 'INSPETOR', userId: s.inspetorA.id, brigadaId: s.brigadaA.id, estado: 'todas', page: 1,
    })
    expect(paraInspetorA.total).toBe(0)

    const paraInspetorB = await getLinhasGlobal({
      role: 'INSPETOR', userId: s.inspetorB.id, brigadaId: s.brigadaB.id, estado: 'todas', page: 1,
    })
    expect(paraInspetorB.total).toBe(1)

    const paraChefeA = await getLinhasGlobal({
      role: 'INSPETOR_CHEFE', userId: s.chefeA.id, brigadaId: s.brigadaA.id, estado: 'todas', page: 1,
    })
    expect(paraChefeA.total).toBe(0)

    const paraChefeB = await getLinhasGlobal({
      role: 'INSPETOR_CHEFE', userId: s.chefeB.id, brigadaId: s.brigadaB.id, estado: 'todas', page: 1,
    })
    expect(paraChefeB.total).toBe(1)
  })

  test('filtros ativas / a-expirar / todas', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    // ativa longe do fim (30d), a expirar (5d) e terminada (-2d) — no mesmo inquérito.
    await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, codigo: '1', dataFim: daysFromNow(30) })
    await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, codigo: '2', dataFim: daysFromNow(5) })
    await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, codigo: '3', dataFim: daysFromNow(-2) })

    const opts = { role: 'INSPETOR' as const, userId: s.inspetorB.id, brigadaId: s.brigadaB.id, page: 1 }
    expect((await getLinhasGlobal({ ...opts, estado: 'todas' })).total).toBe(3)
    expect((await getLinhasGlobal({ ...opts, estado: 'ativas' })).total).toBe(2)
    expect((await getLinhasGlobal({ ...opts, estado: 'a-expirar' })).total).toBe(1)
  })
})

describe('checkIntercecoesATerminar', () => {
  test('dispara o 1.º aviso, marca o flag e não repete na 2.ª corrida', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    // Fim em 5 dias: dentro do 1.º aviso (10d), fora do 2.º (3d).
    const { linha } = await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: daysFromNow(5) })

    const r1 = await checkIntercecoesATerminar()
    expect(r1.alertas).toBe(1)

    const notifs = await prisma.notificacao.findMany({
      where: { tipo: 'INTERCECAO_A_TERMINAR', utilizadorId: s.inspetorB.id },
    })
    expect(notifs).toHaveLength(1)
    expect(notifs[0].inqueritoid).toBe(s.inqB[0].id)

    const after = await prisma.intercecaoLinha.findUnique({ where: { id: linha.id } })
    expect(after!.alerta1Enviado).toBe(true)
    expect(after!.alerta2Enviado).toBe(false)

    // Idempotente: segunda corrida não duplica.
    const r2 = await checkIntercecoesATerminar()
    expect(r2.alertas).toBe(0)
    expect(
      await prisma.notificacao.count({ where: { tipo: 'INTERCECAO_A_TERMINAR' } }),
    ).toBe(1)
  })

  test('linha nova já dentro dos dois limiares dispara os 2 avisos na mesma corrida', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const { linha } = await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: daysFromNow(2) })

    const r = await checkIntercecoesATerminar()
    expect(r.alertas).toBe(2)

    const after = await prisma.intercecaoLinha.findUnique({ where: { id: linha.id } })
    expect(after!.alerta1Enviado).toBe(true)
    expect(after!.alerta2Enviado).toBe(true)
    expect(
      await prisma.notificacao.count({ where: { tipo: 'INTERCECAO_A_TERMINAR' } }),
    ).toBe(2)
  })

  test('linha já vencida sem aviso dispara uma vez (e só uma)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await makeAlvoComLinha({
      inqueritoid: s.inqB[0].id,
      dataFim: daysFromNow(-1),
      alertaDias2: null, // só o 1.º aviso
    })

    expect((await checkIntercecoesATerminar()).alertas).toBe(1)
    expect((await checkIntercecoesATerminar()).alertas).toBe(0)
  })

  test('aviso desligado (null) nunca dispara', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await makeAlvoComLinha({
      inqueritoid: s.inqB[0].id,
      dataFim: daysFromNow(1),
      alertaDias1: null,
      alertaDias2: null,
    })
    expect((await checkIntercecoesATerminar()).alertas).toBe(0)
  })

  test('inquérito soft-deleted não gera alertas', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: daysFromNow(2) })
    await prisma.inquerito.update({ where: { id: s.inqB[0].id }, data: { deletedAt: new Date() } })

    expect((await checkIntercecoesATerminar()).alertas).toBe(0)
  })

  test('reset de flags ao adiar a data de fim → volta a alertar (regressão do gotcha)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const { linha } = await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: daysFromNow(5) })

    await checkIntercecoesATerminar()
    expect(
      (await prisma.intercecaoLinha.findUnique({ where: { id: linha.id } }))!.alerta1Enviado,
    ).toBe(true)

    // Renovação: fim adiado para daqui a 8 dias (ainda dentro do 1.º aviso) e
    // aplica-se o mesmo reset que a rota PUT aplica.
    const before = await prisma.intercecaoLinha.findUnique({ where: { id: linha.id } })
    const novaDataFim = daysFromNow(8)
    const reset = resetAlertFlagsOnUpdate(
      { dataFim: before!.dataFim, alertaDias1: before!.alertaDias1, alertaDias2: before!.alertaDias2 },
      { dataFim: novaDataFim },
    )
    expect(reset).toEqual({ alerta1Enviado: false, alerta2Enviado: false })
    await prisma.intercecaoLinha.update({
      where: { id: linha.id },
      data: { dataFim: novaDataFim, ...reset },
    })

    const r = await checkIntercecoesATerminar()
    expect(r.alertas).toBe(1) // re-alerta após renovação
    expect(
      await prisma.notificacao.count({ where: { tipo: 'INTERCECAO_A_TERMINAR' } }),
    ).toBe(2)
  })
})

describe('v2 — renovação, duração/transcrição, notas', () => {
  test('renovar: renovações++ e flags repostos (como a rota)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const { linha } = await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: daysFromNow(5) })

    // 1.ª corrida marca o 1.º aviso.
    await checkIntercecoesATerminar()
    const before = await prisma.intercecaoLinha.findUnique({ where: { id: linha.id } })
    expect(before!.renovacoes).toBe(0)
    expect(before!.alerta1Enviado).toBe(true)

    // Renovação (o que o POST .../renovar faz): novo fim + increment + reset.
    const novaDataFim = daysFromNow(40)
    const reset = resetAlertFlagsOnUpdate(
      { dataFim: before!.dataFim, alertaDias1: before!.alertaDias1, alertaDias2: before!.alertaDias2 },
      { dataFim: novaDataFim },
    )
    const after = await prisma.intercecaoLinha.update({
      where: { id: linha.id },
      data: { dataFim: novaDataFim, renovacoes: { increment: 1 }, ...reset },
    })
    expect(after.renovacoes).toBe(1)
    expect(after.alerta1Enviado).toBe(false)
    expect(after.alerta2Enviado).toBe(false)
  })

  test('produto persiste duração e paraTranscricao', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const { alvo } = await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: daysFromNow(20) })
    const produto = await prisma.intercecaoProduto.create({
      data: {
        alvoId: alvo.id,
        tipo: 'CHAMADA',
        data: new Date(),
        resumo: 'Chamada a transcrever',
        duracao: '03:45',
        paraTranscricao: true,
        criadoPorId: s.inspetorB.id,
      },
    })
    const read = await prisma.intercecaoProduto.findUnique({ where: { id: produto.id } })
    expect(read!.duracao).toBe('03:45')
    expect(read!.paraTranscricao).toBe(true)
  })

  test('produto: paraTranscricao default false; alvo: notas opcional', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const alvo = await prisma.intercecaoAlvo.create({
      data: { nome: 'X', codigo: '999', inqueritoid: s.inqB[0].id, notas: 'nota relevante' },
    })
    expect(alvo.notas).toBe('nota relevante')
    const produto = await prisma.intercecaoProduto.create({
      data: { alvoId: alvo.id, tipo: 'SMS', data: new Date(), resumo: 'r', criadoPorId: s.inspetorB.id },
    })
    expect(produto.paraTranscricao).toBe(false)
    expect(produto.duracao).toBeNull()
  })
})

describe('cascade e integridade', () => {
  test('apagar o alvo remove linhas e produtos; apagar linha mantém produto (SetNull)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const { alvo, linha } = await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: daysFromNow(20) })
    const produto = await prisma.intercecaoProduto.create({
      data: {
        alvoId: alvo.id,
        linhaId: linha.id,
        tipo: 'CHAMADA',
        data: new Date(),
        resumo: 'Chamada relevante',
        criadoPorId: s.inspetorB.id,
      },
    })

    // Apagar a linha: produto fica, linhaId → null.
    await prisma.intercecaoLinha.delete({ where: { id: linha.id } })
    const produtoAfter = await prisma.intercecaoProduto.findUnique({ where: { id: produto.id } })
    expect(produtoAfter).not.toBeNull()
    expect(produtoAfter!.linhaId).toBeNull()

    // Apagar o alvo: cascade remove os produtos.
    await prisma.intercecaoAlvo.delete({ where: { id: alvo.id } })
    expect(await prisma.intercecaoProduto.count()).toBe(0)
  })

  test('código de alvo é único por inquérito mas repetível entre inquéritos', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.intercecaoAlvo.create({
      data: { nome: 'X', codigo: '123', inqueritoid: s.inqB[0].id },
    })
    // Mesmo código noutro inquérito: OK.
    await expect(
      prisma.intercecaoAlvo.create({ data: { nome: 'Y', codigo: '123', inqueritoid: s.inqB[1].id } }),
    ).resolves.toBeTruthy()
    // Duplicado no mesmo inquérito: viola o @@unique.
    await expect(
      prisma.intercecaoAlvo.create({ data: { nome: 'Z', codigo: '123', inqueritoid: s.inqB[0].id } }),
    ).rejects.toThrow()
  })
})
