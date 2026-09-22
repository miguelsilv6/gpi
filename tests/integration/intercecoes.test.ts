import { describe, test, expect, beforeEach, afterAll } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { checkIntercecoesATerminar, getLinhasGlobal } from '@/lib/intercecoes'
import {
  checkValidacoesIntercecoes,
  getPlanoValidacoes,
  sincronizarValidacoes,
} from '@/lib/intercecoes-validacoes'
import { getContactosPorIdentificar } from '@/lib/intercecoes-relacoes'
import { resetAlertFlagsOnUpdate } from '@/lib/validations/intercecao'
import { invalidatePolicyCache } from '@/lib/notifications'
import { TipoNotificacao } from '@/generated/prisma/enums'

/**
 * Interceções: scope RBAC da lista global, motor de alertas de fim de linha
 * (idempotência, dois avisos, vencidas, soft-delete, reset de flags), o
 * cascade alvo → linhas/produtos, e o controlo de escutas propriamente dito —
 * validações quinzenais com as respetivas renovações, relações (contactos
 * identificados) e "ouvido até" por linha.
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
      inqueritoid: args.inqueritoid,
    },
  })
  const linha = await prisma.intercecaoLinha.create({
    data: {
      alvoId: alvo.id,
      codigo: args.codigo ?? '123',
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

  test('produto persiste duração, ID do sistema e estado de transcrição', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const { alvo } = await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: daysFromNow(20) })
    const produto = await prisma.intercecaoProduto.create({
      data: {
        alvoId: alvo.id,
        tipo: 'VOZ',
        data: new Date(),
        resumo: 'Chamada a transcrever',
        duracao: '03:45',
        // Excede o intervalo seguro dos inteiros de JS — daí ser texto.
        idProduto: '870155919242722000',
        transcricao: 'PEDIDA',
        identificacaoDe: 'Mãe',
        criadoPorId: s.inspetorB.id,
      },
    })
    const read = await prisma.intercecaoProduto.findUnique({ where: { id: produto.id } })
    expect(read!.duracao).toBe('03:45')
    expect(read!.idProduto).toBe('870155919242722000')
    expect(read!.transcricao).toBe('PEDIDA')
    expect(read!.identificacaoDe).toBe('Mãe')
  })

  test('produto: transcrição default NENHUMA; alvo: notas opcional', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const alvo = await prisma.intercecaoAlvo.create({
      data: { nome: 'X', inqueritoid: s.inqB[0].id, notas: 'nota relevante' },
    })
    expect(alvo.notas).toBe('nota relevante')
    const produto = await prisma.intercecaoProduto.create({
      data: { alvoId: alvo.id, tipo: 'SMS', data: new Date(), resumo: 'r', criadoPorId: s.inspetorB.id },
    })
    expect(produto.transcricao).toBe('NENHUMA')
    expect(produto.transcricaoEm).toBeNull()
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

  test('código de linha é único por alvo mas repetível entre alvos (mesmo inquérito ou não)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const alvo1 = await prisma.intercecaoAlvo.create({ data: { nome: 'X', inqueritoid: s.inqB[0].id } })
    const alvo2 = await prisma.intercecaoAlvo.create({ data: { nome: 'Y', inqueritoid: s.inqB[0].id } })
    const linhaBase = {
      tipo: 'SIM' as const,
      identificador: '912345678',
      dataInicio: daysFromNow(-10),
      dataFim: daysFromNow(30),
    }
    await prisma.intercecaoLinha.create({ data: { ...linhaBase, alvoId: alvo1.id, codigo: '123' } })
    // Mesmo código, alvo diferente (mesmo inquérito): OK.
    await expect(
      prisma.intercecaoLinha.create({ data: { ...linhaBase, alvoId: alvo2.id, codigo: '123' } }),
    ).resolves.toBeTruthy()
    // Duplicado no mesmo alvo: viola o @@unique([alvoId, codigo]).
    await expect(
      prisma.intercecaoLinha.create({ data: { ...linhaBase, alvoId: alvo1.id, codigo: '123' } }),
    ).rejects.toThrow()
  })
})

/**
 * Validações quinzenais (art. 188.º CPP): geração das datas a partir do plano,
 * re-sincronização quando as linhas mudam e os dois alertas (validação a
 * aproximar-se e renovação a preparar).
 */
describe('validações quinzenais', () => {
  async function planoCom(inqueritoid: string, dataPrimeira: Date, alertaDias = 3) {
    return prisma.intercecaoPlanoValidacao.create({
      data: { inqueritoid, dataPrimeira, intervaloDias: 14, alertaDias },
    })
  }

  /** Meia-noite UTC de daqui a `days` dias (as datas do módulo vivem assim). */
  function diaUTCdaqui(days: number): Date {
    const d = daysFromNow(days)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  }

  test('sincronizar gera as validações até cobrir o fim da última linha', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: diaUTCdaqui(40) })
    await planoCom(s.inqB[0].id, diaUTCdaqui(-10))

    await sincronizarValidacoes(s.inqB[0].id)

    const plano = await getPlanoValidacoes(s.inqB[0].id)
    // De 14 em 14 dias, de -10 até cobrir +40, mais uma para lá do horizonte.
    expect(plano!.validacoes.map((v) => v.numero)).toEqual([1, 2, 3, 4, 5])
    expect(plano!.validacoes[0].data.getTime()).toBe(diaUTCdaqui(-10).getTime())
    expect(plano!.validacoes[1].data.getTime()).toBe(diaUTCdaqui(4).getTime())
  })

  test('sincronizar é idempotente e não duplica validações', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: diaUTCdaqui(30) })
    await planoCom(s.inqB[0].id, diaUTCdaqui(-10))

    await sincronizarValidacoes(s.inqB[0].id)
    const antes = (await getPlanoValidacoes(s.inqB[0].id))!.validacoes.map((v) => v.id)
    await sincronizarValidacoes(s.inqB[0].id)
    const depois = (await getPlanoValidacoes(s.inqB[0].id))!.validacoes.map((v) => v.id)

    expect(depois).toEqual(antes)
  })

  test('encolher o horizonte remove as validações por fazer, mas guarda as feitas', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const { linha } = await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: diaUTCdaqui(60) })
    const plano = await planoCom(s.inqB[0].id, diaUTCdaqui(-10))
    await sincronizarValidacoes(s.inqB[0].id)

    const todas = await prisma.intercecaoValidacao.findMany({
      where: { planoId: plano.id },
      orderBy: { numero: 'asc' },
    })
    expect(todas.length).toBeGreaterThan(3)
    // A última é marcada como feita antes de o horizonte encolher.
    const ultima = todas.at(-1)!
    await prisma.intercecaoValidacao.update({
      where: { id: ultima.id },
      data: { feitaEm: new Date(), feitaPorId: s.inspetorB.id },
    })

    await prisma.intercecaoLinha.update({
      where: { id: linha.id },
      data: { dataFim: diaUTCdaqui(5) },
    })
    await sincronizarValidacoes(s.inqB[0].id)

    const restantes = await prisma.intercecaoValidacao.findMany({
      where: { planoId: plano.id },
      orderBy: { numero: 'asc' },
    })
    // A feita sobrevive ao corte; as outras excedentes desaparecem.
    expect(restantes.some((v) => v.id === ultima.id)).toBe(true)
    expect(restantes.length).toBeLessThan(todas.length)
  })

  test('mover a data do plano reposiciona as validações e reabre os avisos', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: diaUTCdaqui(30) })
    const plano = await planoCom(s.inqB[0].id, diaUTCdaqui(-10))
    await sincronizarValidacoes(s.inqB[0].id)

    await prisma.intercecaoValidacao.updateMany({
      where: { planoId: plano.id },
      data: { alertaEnviado: true },
    })
    await prisma.intercecaoPlanoValidacao.update({
      where: { id: plano.id },
      data: { dataPrimeira: diaUTCdaqui(-9) },
    })
    await sincronizarValidacoes(s.inqB[0].id)

    const primeira = await prisma.intercecaoValidacao.findFirst({
      where: { planoId: plano.id, numero: 1 },
    })
    expect(primeira!.data.getTime()).toBe(diaUTCdaqui(-9).getTime())
    // Adiar uma validação tem de voltar a alertar.
    expect(primeira!.alertaEnviado).toBe(false)
  })

  test('alerta de validação: dispara dentro da antecedência, marca o flag e não repete', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    // Fim longe para não haver renovação a preparar nesta validação.
    await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: diaUTCdaqui(200) })
    await planoCom(s.inqB[0].id, diaUTCdaqui(2)) // 1.ª validação dentro dos 3 dias
    await sincronizarValidacoes(s.inqB[0].id)

    const r1 = await checkValidacoesIntercecoes()
    expect(r1.alertas).toBe(1)

    const notifs = await prisma.notificacao.findMany({
      where: { tipo: 'INTERCECAO_VALIDACAO_APROXIMA', utilizadorId: s.inspetorB.id },
    })
    expect(notifs).toHaveLength(1)
    expect(notifs[0].inqueritoid).toBe(s.inqB[0].id)

    // Idempotente.
    expect((await checkValidacoesIntercecoes()).alertas).toBe(0)
  })

  test('alerta de validação: não dispara fora da antecedência nem depois de feita', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: diaUTCdaqui(200) })
    const plano = await planoCom(s.inqB[0].id, diaUTCdaqui(10)) // longe dos 3 dias
    await sincronizarValidacoes(s.inqB[0].id)

    expect((await checkValidacoesIntercecoes()).alertas).toBe(0)

    // Marcada como feita: fica fora da varredura mesmo quando a data chega.
    await prisma.intercecaoValidacao.updateMany({
      where: { planoId: plano.id },
      data: { feitaEm: new Date() },
    })
    await prisma.intercecaoPlanoValidacao.update({
      where: { id: plano.id },
      data: { alertaDias: 365 },
    })
    expect((await checkValidacoesIntercecoes()).alertas).toBe(0)
  })

  test('alerta de renovação: só na validação que antecede o fim da linha', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    // 1.ª validação daqui a 1 dia; fim da linha a 8 dias → a renovação
    // prepara-se na 1.ª (a 2.ª cai a 15 dias, já depois do fim).
    await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: diaUTCdaqui(8) })
    await planoCom(s.inqB[0].id, diaUTCdaqui(1))
    await sincronizarValidacoes(s.inqB[0].id)

    await checkValidacoesIntercecoes()

    const renovacao = await prisma.notificacao.findMany({
      where: { tipo: 'INTERCECAO_RENOVACAO_PREPARAR', utilizadorId: s.inspetorB.id },
    })
    expect(renovacao).toHaveLength(1)
    expect(renovacao[0].mensagem).toContain('912345678')

    // A validação seguinte não repete o aviso desta linha.
    const comFlag = await prisma.intercecaoValidacao.findMany({
      where: { alertaRenovacaoEnviado: true },
    })
    expect(comFlag).toHaveLength(1)
    expect(comFlag[0].numero).toBe(1)
  })

  test('apagar o inquérito apaga o plano e as validações (cascade)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: diaUTCdaqui(30) })
    await planoCom(s.inqB[0].id, diaUTCdaqui(-10))
    await sincronizarValidacoes(s.inqB[0].id)
    expect(await prisma.intercecaoValidacao.count()).toBeGreaterThan(0)

    await prisma.inquerito.delete({ where: { id: s.inqB[0].id } })
    expect(await prisma.intercecaoPlanoValidacao.count()).toBe(0)
    expect(await prisma.intercecaoValidacao.count()).toBe(0)
  })
})

/** Relações: unicidade por inquérito e resolução do "DE"/"PARA" dos produtos. */
describe('relações', () => {
  test('o mesmo contacto não pode ser fichado duas vezes no mesmo inquérito', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const base = { inqueritoid: s.inqB[0].id, criadoPorId: s.inspetorB.id, contacto: '928022089' }
    await prisma.intercecaoRelacao.create({ data: base })
    await expect(prisma.intercecaoRelacao.create({ data: base })).rejects.toThrow()
    // Noutro inquérito é um registo legítimo.
    await expect(
      prisma.intercecaoRelacao.create({ data: { ...base, inqueritoid: s.inqB[1].id } }),
    ).resolves.toBeTruthy()
  })

  test('contactos por identificar: só os que aparecem nos produtos e não têm ficha', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const { alvo } = await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: daysFromNow(20) })
    const produto = (de: string, para: string) => ({
      alvoId: alvo.id,
      tipo: 'VOZ' as const,
      data: new Date(),
      resumo: 'r',
      criadoPorId: s.inspetorB.id,
      de,
      para,
    })
    await prisma.intercecaoProduto.createMany({
      data: [
        produto('928022089', '963386293'),
        produto('935615162', '928022089'),
        // A formatação não cria um contacto novo.
        produto('963 386 293', '928022089'),
      ],
    })
    await prisma.intercecaoRelacao.create({
      data: {
        inqueritoid: s.inqB[0].id,
        criadoPorId: s.inspetorB.id,
        contacto: '928022089',
        nome: 'Miguel Viegas',
      },
    })

    const pendentes = await getContactosPorIdentificar(s.inqB[0].id)
    expect(pendentes.map((p) => p.contacto)).toEqual(['963386293', '935615162'])
    // "963386293" aparece duas vezes (uma delas com espaços).
    expect(pendentes[0].ocorrencias).toBe(2)
  })

  test('apagar o inquérito apaga as relações (cascade)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.intercecaoRelacao.create({
      data: { inqueritoid: s.inqB[0].id, criadoPorId: s.inspetorB.id, contacto: '911111111' },
    })
    await prisma.inquerito.delete({ where: { id: s.inqB[0].id } })
    expect(await prisma.intercecaoRelacao.count()).toBe(0)
  })
})

/** "Ouvido até": histórico por linha, o mais recente é o corrente. */
describe('ouvido até', () => {
  test('cada registo é uma entrada nova e o mais recente fica à cabeça', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const { linha } = await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: daysFromNow(20) })

    await prisma.intercecaoOuvidoAte.create({
      data: {
        linhaId: linha.id,
        registadoPorId: s.inspetorB.id,
        numeroProduto: '100',
        data: new Date('2026-08-01T00:00:00Z'),
      },
    })
    await prisma.intercecaoOuvidoAte.create({
      data: {
        linhaId: linha.id,
        registadoPorId: s.inspetorB.id,
        numeroProduto: '70623',
        data: new Date('2026-08-27T00:00:00Z'),
        horaInicio: '14:49',
      },
    })

    const historico = await prisma.intercecaoOuvidoAte.findMany({
      where: { linhaId: linha.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(historico).toHaveLength(2)
    expect(historico[0].numeroProduto).toBe('70623')
    expect(historico[0].horaInicio).toBe('14:49')
  })

  test('apagar a linha apaga o seu histórico (cascade)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const { linha } = await makeAlvoComLinha({ inqueritoid: s.inqB[0].id, dataFim: daysFromNow(20) })
    await prisma.intercecaoOuvidoAte.create({
      data: { linhaId: linha.id, registadoPorId: s.inspetorB.id, data: new Date() },
    })
    await prisma.intercecaoLinha.delete({ where: { id: linha.id } })
    expect(await prisma.intercecaoOuvidoAte.count()).toBe(0)
  })
})
