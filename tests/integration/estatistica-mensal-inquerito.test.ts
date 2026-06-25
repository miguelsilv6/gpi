import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { buildEstatisticaMensal } from '@/lib/estatistica-mensal'

/**
 * Detalhe por inquérito da Estatística Mensal: para cada NUIPC, que atividades
 * (e quantas) foram realizadas no mês. Objetivo: "no inquérito X foram feitas 3
 * constituições de arguido".
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

const ANO = 2026
const MES = 3
const dentro = new Date(Date.UTC(2026, 2, 15, 10, 0, 0)) // 15 de março
const fora = new Date(Date.UTC(2026, 3, 2, 10, 0, 0)) // 2 de abril (mês seguinte)

async function semearPadroes() {
  await prisma.atividadePadrao.createMany({
    data: [
      { nome: 'Constituição de arguido', ativa: true, contaParaEstatistica: true, temQuantidade: true, ordem: 1 },
      { nome: 'Inquirição de testemunha', ativa: true, contaParaEstatistica: true, temQuantidade: false, ordem: 2 },
      { nome: 'Diligência interna', ativa: true, contaParaEstatistica: false, temQuantidade: false, ordem: 3 },
    ],
  })
}

describe('buildEstatisticaMensal — detalhe por inquérito', () => {
  test('agrega atividades por NUIPC, respeitando quantidade', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await semearPadroes()
    const inq = s.inqA[0] // A-001/22

    // 3 constituições de arguido (uma linha com quantidade=3) + 2 inquirições
    // (duas linhas, padrão sem quantidade → conta 1 cada).
    await prisma.atividade.create({
      data: { descricao: 'Constituição de arguido', quantidade: 3, dataRealizacao: dentro, inqueritoid: inq.id, utilizadorId: s.inspetorA.id },
    })
    await prisma.atividade.create({
      data: { descricao: 'Inquirição de testemunha', dataRealizacao: dentro, inqueritoid: inq.id, utilizadorId: s.inspetorA.id },
    })
    await prisma.atividade.create({
      data: { descricao: 'Inquirição de testemunha', dataRealizacao: dentro, inqueritoid: inq.id, utilizadorId: s.inspetorA.id },
    })

    const data = await buildEstatisticaMensal({ ano: ANO, mes: MES, role: 'COORDENADOR', sessionBrigadaId: null })
    expect(data).not.toBeNull()

    const detalhe = data!.porInquerito.find((p) => p.nuipc === 'A-001/22')
    expect(detalhe).toBeDefined()
    expect(detalhe!.brigadaNome).toBe('Brigada Alpha')
    expect(detalhe!.slug.length).toBeGreaterThan(0)
    expect(detalhe!.total).toBe(5) // 3 + 1 + 1

    const consts = detalhe!.atividades.find((a) => a.nome === 'Constituição de arguido')
    expect(consts!.quantidade).toBe(3)
    const inquiricoes = detalhe!.atividades.find((a) => a.nome === 'Inquirição de testemunha')
    expect(inquiricoes!.quantidade).toBe(2)
  })

  test('ignora atividades fora do período e padrões fora de estatística', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await semearPadroes()
    const inq = s.inqA[0]

    await prisma.atividade.create({
      data: { descricao: 'Inquirição de testemunha', dataRealizacao: dentro, inqueritoid: inq.id, utilizadorId: s.inspetorA.id },
    })
    // Fora do mês — não conta.
    await prisma.atividade.create({
      data: { descricao: 'Inquirição de testemunha', dataRealizacao: fora, inqueritoid: inq.id, utilizadorId: s.inspetorA.id },
    })
    // Padrão com contaParaEstatistica = false — não conta.
    await prisma.atividade.create({
      data: { descricao: 'Diligência interna', dataRealizacao: dentro, inqueritoid: inq.id, utilizadorId: s.inspetorA.id },
    })

    const data = await buildEstatisticaMensal({ ano: ANO, mes: MES, role: 'COORDENADOR', sessionBrigadaId: null })
    const detalhe = data!.porInquerito.find((p) => p.nuipc === 'A-001/22')
    expect(detalhe).toBeDefined()
    expect(detalhe!.total).toBe(1)
    expect(detalhe!.atividades).toHaveLength(1)
    expect(detalhe!.atividades[0].nome).toBe('Inquirição de testemunha')
  })

  test('inquéritos sem atividades elegíveis não aparecem no detalhe', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await semearPadroes()
    await prisma.atividade.create({
      data: { descricao: 'Inquirição de testemunha', dataRealizacao: dentro, inqueritoid: s.inqA[0].id, utilizadorId: s.inspetorA.id },
    })

    const data = await buildEstatisticaMensal({ ano: ANO, mes: MES, role: 'COORDENADOR', sessionBrigadaId: null })
    expect(data!.porInquerito.map((p) => p.nuipc)).toEqual(['A-001/22'])
  })

  test('INSPETOR_CHEFE só vê o detalhe da sua brigada', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await semearPadroes()
    await prisma.atividade.create({
      data: { descricao: 'Inquirição de testemunha', dataRealizacao: dentro, inqueritoid: s.inqA[0].id, utilizadorId: s.inspetorA.id },
    })
    await prisma.atividade.create({
      data: { descricao: 'Inquirição de testemunha', dataRealizacao: dentro, inqueritoid: s.inqB[0].id, utilizadorId: s.inspetorB.id },
    })

    const data = await buildEstatisticaMensal({
      ano: ANO,
      mes: MES,
      role: 'INSPETOR_CHEFE',
      sessionBrigadaId: s.brigadaA.id,
    })
    expect(data!.porInquerito.map((p) => p.nuipc)).toEqual(['A-001/22'])
  })

  test('exclui inquérito soft-deleted do detalhe', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await semearPadroes()
    await prisma.atividade.create({
      data: { descricao: 'Inquirição de testemunha', dataRealizacao: dentro, inqueritoid: s.inqA[0].id, utilizadorId: s.inspetorA.id },
    })
    await prisma.inquerito.update({ where: { id: s.inqA[0].id }, data: { deletedAt: new Date() } })

    const data = await buildEstatisticaMensal({ ano: ANO, mes: MES, role: 'COORDENADOR', sessionBrigadaId: null })
    expect(data!.porInquerito).toHaveLength(0)
  })
})
