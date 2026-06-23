import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { getRelacoesForInquerito } from '@/lib/relacoes'

/**
 * Ligações entre inquéritos (apensos/conexões). A relação é guardada uma vez
 * (origem→destino) mas lida nos dois sentidos. Estes testes garantem:
 *  - simetria da leitura;
 *  - que o scope por role nunca revela um inquérito relacionado fora do âmbito;
 *  - que inquéritos relacionados soft-deleted não aparecem.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

async function relacionar(prismaClient: typeof prisma, origemId: string, destinoId: string, criadoPorId: string) {
  return prismaClient.inqueritoRelacao.create({
    data: { origemId, destinoId, criadoPorId, tipo: 'APENSO' },
  })
}

describe('getRelacoesForInquerito', () => {
  test('é simétrica: a ligação aparece nos dois inquéritos', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await relacionar(prisma, s.inqA[0].id, s.inqA[1].id, s.inspetorA.id)

    const deA1 = await getRelacoesForInquerito(s.inqA[0].id, 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(deA1.map((r) => r.inquerito.nuipc)).toEqual(['A-002/22'])

    const deA2 = await getRelacoesForInquerito(s.inqA[1].id, 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(deA2.map((r) => r.inquerito.nuipc)).toEqual(['A-001/22'])
    expect(deA2[0].tipo).toBe('APENSO')
  })

  test('não revela um inquérito relacionado fora do âmbito do utilizador', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    // Liga um inquérito de A a um de B (ligação cross-brigada).
    await relacionar(prisma, s.inqA[0].id, s.inqB[0].id, s.chefeA.id)

    // O inspetor de A NÃO vê o inquérito de B (fora do âmbito).
    const deA1 = await getRelacoesForInquerito(s.inqA[0].id, 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(deA1).toHaveLength(0)

    // O inspetor de B também não vê o de A.
    const deB1 = await getRelacoesForInquerito(s.inqB[0].id, 'INSPETOR', s.inspetorB.id, s.brigadaB.id)
    expect(deB1).toHaveLength(0)

    // O COORDENADOR (âmbito global) vê a ligação em ambos os sentidos.
    const coordA = await getRelacoesForInquerito(s.inqA[0].id, 'COORDENADOR', s.chefeA.id, null)
    expect(coordA.map((r) => r.inquerito.nuipc)).toEqual(['B-001/22'])
    const coordB = await getRelacoesForInquerito(s.inqB[0].id, 'COORDENADOR', s.chefeA.id, null)
    expect(coordB.map((r) => r.inquerito.nuipc)).toEqual(['A-001/22'])
  })

  test('exclui inquéritos relacionados soft-deleted', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await relacionar(prisma, s.inqA[0].id, s.inqA[1].id, s.inspetorA.id)
    await prisma.inquerito.update({ where: { id: s.inqA[1].id }, data: { deletedAt: new Date() } })

    const deA1 = await getRelacoesForInquerito(s.inqA[0].id, 'INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(deA1).toHaveLength(0)
  })
})
