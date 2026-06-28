import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'

/**
 * Listagem de "documentação pendente": é PRIVADA do autor — cada utilizador só
 * vê as marcas que ele próprio criou (filtro por documentacaoPendentePorId),
 * independentemente do role/âmbito. Exclui não-marcados e soft-deleted.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

// Espelha a query da página /documentacao-pendente.
async function listarPara(userId: string) {
  return prisma.inquerito.findMany({
    where: { deletedAt: null, documentacaoPendente: true, documentacaoPendentePorId: userId },
    select: { nuipc: true },
    orderBy: { documentacaoPendenteDesde: 'asc' },
  })
}

async function marcar(prismaId: string, porId: string, desde: Date) {
  await prisma.inquerito.update({
    where: { id: prismaId },
    data: {
      documentacaoPendente: true,
      documentacaoPendentePorId: porId,
      documentacaoPendenteDesde: desde,
    },
  })
}

describe('documentação pendente — privada do autor', () => {
  test('cada utilizador só vê as marcas que criou', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await marcar(s.inqA[0].id, s.inspetorA.id, new Date('2026-06-01'))
    await marcar(s.inqB[0].id, s.chefeB.id, new Date('2026-06-02'))

    expect((await listarPara(s.inspetorA.id)).map((i) => i.nuipc)).toEqual(['A-001/22'])
    expect((await listarPara(s.chefeB.id)).map((i) => i.nuipc)).toEqual(['B-001/22'])

    // O coordenador, apesar de ter âmbito global, não marcou nada → não vê nada.
    expect(await listarPara(s.chefeA.id)).toHaveLength(0)
  })

  test('exclui não-marcados e soft-deleted da lista do autor', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await marcar(s.inqA[0].id, s.inspetorA.id, new Date('2026-06-01'))
    await marcar(s.inqA[1].id, s.inspetorA.id, new Date('2026-06-03'))
    await prisma.inquerito.update({
      where: { id: s.inqA[1].id },
      data: { deletedAt: new Date() },
    })

    expect((await listarPara(s.inspetorA.id)).map((i) => i.nuipc)).toEqual(['A-001/22'])
  })
})
