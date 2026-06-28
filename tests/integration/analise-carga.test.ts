import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeBrigada, makeEstado, makeUtilizador, makeInquerito } from '../helpers/fixtures'
import { computeAnalise } from '@/lib/analise'

/**
 * Carga por inspetor + antiguidade dos inquéritos ativos (computeAnalise).
 * Só contam inquéritos ativos (estado não terminal, não eliminados).
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000)

describe('computeAnalise — carga e antiguidade', () => {
  test('agrega carga por inspetor e antiguidade dos ativos', async () => {
    const brigada = await makeBrigada(prisma, { nome: 'Brigada A' })
    const aberto = await makeEstado(prisma, { codigo: 'ABERTO', nome: 'Aberto', terminal: false })
    const arquivado = await makeEstado(prisma, { codigo: 'ARQUIVADO', nome: 'Arquivado', terminal: true })
    const insp1 = await makeUtilizador(prisma, { nome: 'Insp Um', role: 'INSPETOR', brigadaId: brigada.id })
    const insp2 = await makeUtilizador(prisma, { nome: 'Insp Dois', role: 'INSPETOR', brigadaId: brigada.id })

    const base = { estadoId: aberto.id, brigadaId: brigada.id }

    // insp1: 1 recente (vencido) + 1 antigo (no prazo)
    const i1 = await makeInquerito(prisma, { ...base, inspetorId: insp1.id, nuipc: 'A-1/26', dataAbertura: daysAgo(10) })
    await prisma.inquerito.update({ where: { id: i1.id }, data: { dataPrazo: daysAgo(5) } })
    const i2 = await makeInquerito(prisma, { ...base, inspetorId: insp1.id, nuipc: 'A-2/26', dataAbertura: daysAgo(200) })
    await prisma.inquerito.update({ where: { id: i2.id }, data: { dataPrazo: daysAhead(10) } })
    // insp2: 1 a meio
    await makeInquerito(prisma, { ...base, inspetorId: insp2.id, nuipc: 'A-3/26', dataAbertura: daysAgo(60) })
    // sem inspetor: muito antigo
    await makeInquerito(prisma, { ...base, inspetorId: null, nuipc: 'A-4/26', dataAbertura: daysAgo(400) })
    // terminal → não conta
    await makeInquerito(prisma, { estadoId: arquivado.id, brigadaId: brigada.id, inspetorId: insp1.id, nuipc: 'A-5/26', dataAbertura: daysAgo(30) })

    const r = await computeAnalise(brigada.id)

    // Carga por inspetor (ordenada por ativos desc).
    const um = r.cargaPorInspetor.find((c) => c.nome === 'Insp Um')
    const dois = r.cargaPorInspetor.find((c) => c.nome === 'Insp Dois')
    const sem = r.cargaPorInspetor.find((c) => c.nome === 'Sem inspetor')
    expect(um).toMatchObject({ ativos: 2, vencidos: 1 })
    expect(dois).toMatchObject({ ativos: 1, vencidos: 0 })
    expect(sem).toMatchObject({ ativos: 1, vencidos: 0 })
    expect(r.cargaPorInspetor[0].nome).toBe('Insp Um') // maior carga primeiro

    // Antiguidade (buckets: <30, 30–90, 90–180, 180–365, >1ano).
    expect(r.agingAtivos.map((b) => b.count)).toEqual([1, 1, 0, 1, 1])
    // Total = 4 ativos (o arquivado não conta).
    expect(r.ativos).toBe(4)
  })

  test('respeita o âmbito por brigada', async () => {
    const brigadaA = await makeBrigada(prisma, { nome: 'Brigada A' })
    const brigadaB = await makeBrigada(prisma, { nome: 'Brigada B' })
    const aberto = await makeEstado(prisma, { codigo: 'ABERTO', nome: 'Aberto', terminal: false })
    const inspB = await makeUtilizador(prisma, { nome: 'Insp B', role: 'INSPETOR', brigadaId: brigadaB.id })
    await makeInquerito(prisma, { estadoId: aberto.id, brigadaId: brigadaB.id, inspetorId: inspB.id, nuipc: 'B-1/26', dataAbertura: daysAgo(5) })

    const a = await computeAnalise(brigadaA.id)
    expect(a.ativos).toBe(0)
    expect(a.cargaPorInspetor).toHaveLength(0)
  })
})
