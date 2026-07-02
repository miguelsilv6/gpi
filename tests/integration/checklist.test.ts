import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { computeChecklist, getChecklistForInquerito } from '@/lib/checklist'

/**
 * Checklist por tipo de crime. Garante:
 *  - completude calculada contra as atividades registadas (sem estado próprio);
 *  - null quando o crime não tem checklist (ou inquérito sem crime);
 *  - contagem por item e ordem preservada.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('computeChecklist (pura)', () => {
  test('marca done quando há pelo menos um registo com o nome do padrão', () => {
    const view = computeChecklist(
      [
        { atividadePadraoId: 'p1', nome: 'Inquirição' },
        { atividadePadraoId: 'p2', nome: 'Pedido à operadora' },
      ],
      new Map([['Inquirição', 2]]),
    )
    expect(view.done).toBe(1)
    expect(view.total).toBe(2)
    expect(view.items[0]).toEqual({ atividadePadraoId: 'p1', nome: 'Inquirição', done: true, count: 2 })
    expect(view.items[1].done).toBe(false)
  })

  test('checklist vazia devolve 0/0', () => {
    expect(computeChecklist([], new Map())).toEqual({ items: [], done: 0, total: 0 })
  })
})

describe('getChecklistForInquerito', () => {
  async function setup() {
    const s = await scenarioTwoBrigadas(prisma)
    const crime = await prisma.crime.create({ data: { nome: 'Burla Informática' } })
    const p1 = await prisma.atividadePadrao.create({ data: { nome: 'Pedido à operadora', ordem: 1 } })
    const p2 = await prisma.atividadePadrao.create({ data: { nome: 'Exame ao equipamento', ordem: 2 } })
    await prisma.crimeChecklistItem.createMany({
      data: [
        { crimeId: crime.id, atividadePadraoId: p1.id, ordem: 0 },
        { crimeId: crime.id, atividadePadraoId: p2.id, ordem: 1 },
      ],
    })
    await prisma.inquerito.update({ where: { id: s.inqA[0].id }, data: { crimeId: crime.id } })
    return { s, crime, p1, p2 }
  }

  test('cruza itens esperados com atividades registadas, na ordem configurada', async () => {
    const { s, crime } = await setup()
    // Regista uma atividade do 1.º item (e outra irrelevante).
    await prisma.atividade.create({
      data: {
        descricao: 'Pedido à operadora',
        dataRealizacao: new Date(),
        inqueritoid: s.inqA[0].id,
        utilizadorId: s.inspetorA.id,
      },
    })
    await prisma.atividade.create({
      data: {
        descricao: 'Outra coisa',
        dataRealizacao: new Date(),
        inqueritoid: s.inqA[0].id,
        utilizadorId: s.inspetorA.id,
      },
    })

    const view = await getChecklistForInquerito(crime.id, s.inqA[0].id)
    expect(view).not.toBeNull()
    expect(view!.total).toBe(2)
    expect(view!.done).toBe(1)
    expect(view!.items.map((i) => i.nome)).toEqual(['Pedido à operadora', 'Exame ao equipamento'])
    expect(view!.items[0].done).toBe(true)
    expect(view!.items[1].done).toBe(false)
  })

  test('atividades de OUTRO inquérito não contam', async () => {
    const { s, crime } = await setup()
    await prisma.atividade.create({
      data: {
        descricao: 'Pedido à operadora',
        dataRealizacao: new Date(),
        inqueritoid: s.inqA[1].id, // outro inquérito
        utilizadorId: s.inspetorA.id,
      },
    })
    const view = await getChecklistForInquerito(crime.id, s.inqA[0].id)
    expect(view!.done).toBe(0)
  })

  test('null sem checklist configurada ou sem crime', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const semChecklist = await prisma.crime.create({ data: { nome: 'Furto' } })
    expect(await getChecklistForInquerito(semChecklist.id, s.inqA[0].id)).toBeNull()
    expect(await getChecklistForInquerito(null, s.inqA[0].id)).toBeNull()
  })
})
