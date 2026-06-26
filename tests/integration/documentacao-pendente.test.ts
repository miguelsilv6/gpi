import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { buildInqueritoWhere } from '@/lib/role-scope'

/**
 * Listagem de "documentação pendente": o filtro (documentacaoPendente:true +
 * deletedAt:null) combinado com o âmbito por role tem de respeitar quem vê o quê.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

async function listar(role: Parameters<typeof buildInqueritoWhere>[0], userId: string, brigadaId: string | null) {
  const where = buildInqueritoWhere(role, userId, brigadaId)
  return prisma.inquerito.findMany({
    where: { ...where, deletedAt: null, documentacaoPendente: true },
    select: { nuipc: true },
    orderBy: { documentacaoPendenteDesde: 'asc' },
  })
}

describe('documentação pendente — âmbito e filtro', () => {
  test('cada role vê apenas os inquéritos pendentes do seu âmbito', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    // Marca um inquérito pendente em cada brigada; deixa inqA[1] por marcar.
    await prisma.inquerito.update({
      where: { id: s.inqA[0].id },
      data: { documentacaoPendente: true, documentacaoPendenteDesde: new Date('2026-06-01') },
    })
    await prisma.inquerito.update({
      where: { id: s.inqB[0].id },
      data: { documentacaoPendente: true, documentacaoPendenteDesde: new Date('2026-06-02') },
    })

    const insp = await listar('INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(insp.map((i) => i.nuipc)).toEqual(['A-001/22'])

    const chefe = await listar('INSPETOR_CHEFE', s.chefeA.id, s.brigadaA.id)
    expect(chefe.map((i) => i.nuipc)).toEqual(['A-001/22'])

    const coord = await listar('COORDENADOR', s.chefeA.id, null)
    expect(coord.map((i) => i.nuipc)).toEqual(['A-001/22', 'B-001/22'])
  })

  test('não marcados e soft-deleted não aparecem', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.inquerito.update({
      where: { id: s.inqA[0].id },
      data: { documentacaoPendente: true, documentacaoPendenteDesde: new Date('2026-06-01') },
    })
    await prisma.inquerito.update({
      where: { id: s.inqA[1].id },
      data: { documentacaoPendente: true, documentacaoPendenteDesde: new Date('2026-06-03'), deletedAt: new Date() },
    })

    // inqA[1] está marcado mas soft-deleted → fora; os restantes nunca foram marcados.
    const coord = await listar('COORDENADOR', s.chefeA.id, null)
    expect(coord.map((i) => i.nuipc)).toEqual(['A-001/22'])
  })
})
