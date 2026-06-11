import { describe, test, expect, beforeEach, afterAll } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeUtilizador, makeBrigada, makeEstado, makeInquerito } from '../helpers/fixtures'
import { queryInatividade } from '@/lib/relatorios/inatividade'

const prisma = getTestPrisma()

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('relatório de inquéritos parados', () => {
  test('lista inquéritos sem atividades há mais de N dias', async () => {
    const brigada = await makeBrigada(prisma)
    const estado = await makeEstado(prisma, { codigo: 'ABERTO' })
    const inspetor = await makeUtilizador(prisma, { brigadaId: brigada.id })

    // Parado: aberto há 60 dias, sem atividades.
    await makeInquerito(prisma, {
      estadoId: estado.id,
      brigadaId: brigada.id,
      inspetorId: inspetor.id,
      nuipc: 'PARADO-001',
      dataAbertura: daysAgo(60),
    })

    // Ativo: aberto há 60 dias mas com atividade recente.
    const ativo = await makeInquerito(prisma, {
      estadoId: estado.id,
      brigadaId: brigada.id,
      inspetorId: inspetor.id,
      nuipc: 'ATIVO-001',
      dataAbertura: daysAgo(60),
    })
    await prisma.atividade.create({
      data: {
        descricao: 'Diligência recente',
        inqueritoid: ativo.id,
        utilizadorId: inspetor.id,
        createdAt: daysAgo(5),
      },
    })

    const result = await queryInatividade(new URLSearchParams({ dias: '30' }), {
      id: inspetor.id,
      nome: inspetor.nome,
      role: 'ADMINISTRACAO',
      brigadaId: null,
    })

    const nuipcs = result.rows.map((r) => r.nuipc)
    expect(nuipcs).toContain('PARADO-001')
    expect(nuipcs).not.toContain('ATIVO-001')
  })

  test('inquérito com atividade antiga (anterior ao limiar) conta como parado', async () => {
    const brigada = await makeBrigada(prisma)
    const estado = await makeEstado(prisma, { codigo: 'ABERTO' })
    const inspetor = await makeUtilizador(prisma, { brigadaId: brigada.id })

    const inq = await makeInquerito(prisma, {
      estadoId: estado.id,
      brigadaId: brigada.id,
      inspetorId: inspetor.id,
      nuipc: 'VELHO-001',
      dataAbertura: daysAgo(120),
    })
    await prisma.atividade.create({
      data: {
        descricao: 'Atividade antiga',
        inqueritoid: inq.id,
        utilizadorId: inspetor.id,
        createdAt: daysAgo(90),
      },
    })

    const result = await queryInatividade(new URLSearchParams({ dias: '30' }), {
      id: inspetor.id,
      nome: inspetor.nome,
      role: 'ADMINISTRACAO',
      brigadaId: null,
    })

    const row = result.rows.find((r) => r.nuipc === 'VELHO-001')
    expect(row).toBeDefined()
    expect(Number(row!.diasParado)).toBeGreaterThanOrEqual(89)
    expect(String(row!.ultimaAtividade)).toContain('Atividade antiga')
  })

  test('exclui inquéritos em estado terminal e recém-abertos', async () => {
    const brigada = await makeBrigada(prisma)
    const aberto = await makeEstado(prisma, { codigo: 'ABERTO' })
    const terminal = await makeEstado(prisma, { codigo: 'CONCLUIDO', terminal: true })
    const inspetor = await makeUtilizador(prisma, { brigadaId: brigada.id })

    await makeInquerito(prisma, {
      estadoId: terminal.id,
      brigadaId: brigada.id,
      inspetorId: inspetor.id,
      nuipc: 'TERMINAL-001',
      dataAbertura: daysAgo(100),
    })
    await makeInquerito(prisma, {
      estadoId: aberto.id,
      brigadaId: brigada.id,
      inspetorId: inspetor.id,
      nuipc: 'RECENTE-001',
      dataAbertura: daysAgo(5),
    })

    const result = await queryInatividade(new URLSearchParams({ dias: '30' }), {
      id: inspetor.id,
      nome: inspetor.nome,
      role: 'ADMINISTRACAO',
      brigadaId: null,
    })

    const nuipcs = result.rows.map((r) => r.nuipc)
    expect(nuipcs).not.toContain('TERMINAL-001')
    expect(nuipcs).not.toContain('RECENTE-001')
  })

  test('INSPETOR_CHEFE fica preso à sua brigada mesmo com brigadaId no URL', async () => {
    const brigadaA = await makeBrigada(prisma, { nome: 'Alpha' })
    const brigadaB = await makeBrigada(prisma, { nome: 'Bravo' })
    const estado = await makeEstado(prisma, { codigo: 'ABERTO' })
    const chefeA = await makeUtilizador(prisma, {
      role: 'INSPETOR_CHEFE',
      brigadaId: brigadaA.id,
    })

    await makeInquerito(prisma, {
      estadoId: estado.id,
      brigadaId: brigadaA.id,
      nuipc: 'A-PARADO',
      dataAbertura: daysAgo(60),
    })
    await makeInquerito(prisma, {
      estadoId: estado.id,
      brigadaId: brigadaB.id,
      nuipc: 'B-PARADO',
      dataAbertura: daysAgo(60),
    })

    // Tentativa de bypass: chefe de A pede brigadaId=B.
    const result = await queryInatividade(
      new URLSearchParams({ dias: '30', brigadaId: brigadaB.id }),
      {
        id: chefeA.id,
        nome: chefeA.nome,
        role: 'INSPETOR_CHEFE',
        brigadaId: brigadaA.id,
      },
    )

    const nuipcs = result.rows.map((r) => r.nuipc)
    expect(nuipcs).toContain('A-PARADO')
    expect(nuipcs).not.toContain('B-PARADO')
  })
})
