import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { produtosPorMarcar, marcarProdutosOuvidos } from '@/lib/intercecoes-ouvidos'
import { parseDataHoraPt } from '@/lib/datetime-pt'

/**
 * "Acompanhado até" → marcar como ouvidos os produtos do alvo com data/hora
 * (data + hora de início) igual ou anterior. Compara em hora de parede.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

async function cenario() {
  const s = await scenarioTwoBrigadas(prisma)
  const alvo = await prisma.intercecaoAlvo.create({ data: { nome: 'Alvo', inqueritoid: s.inqA[0].id } })
  const outro = await prisma.intercecaoAlvo.create({ data: { nome: 'Outro', inqueritoid: s.inqA[0].id } })
  const mk = (alvoId: string, data: string, horaInicio: string | null, extra: object = {}) =>
    prisma.intercecaoProduto.create({
      data: {
        alvoId,
        tipo: 'CHAMADA',
        data: new Date(data),
        horaInicio,
        resumo: `${data} ${horaInicio ?? ''}`,
        criadoPorId: s.inspetorA.id,
        ...extra,
      },
    })
  return { alvo, outro, mk }
}

describe('produtos por marcar / marcar ouvidos', () => {
  test('inclui só os produtos até à data/hora (inclusive) e ainda não ouvidos', async () => {
    const { alvo, mk } = await cenario()
    const antes = await mk(alvo.id, '2026-06-10', '23:59')
    const igual = await mk(alvo.id, '2026-06-11', '10:30')
    await mk(alvo.id, '2026-06-11', '10:31') // depois
    await mk(alvo.id, '2026-06-12', null) // dia seguinte
    const semHora = await mk(alvo.id, '2026-06-11', null) // início do dia → conta
    await mk(alvo.id, '2026-06-01', '08:00', { ouvido: true, ouvidoEm: new Date() }) // já ouvido

    const ate = parseDataHoraPt('11-06-2026 10:30:00')!
    const ids = await produtosPorMarcar(alvo.id, ate)
    expect(new Set(ids)).toEqual(new Set([antes.id, igual.id, semHora.id]))
  })

  test('marcarProdutosOuvidos atualiza só o alvo indicado e é idempotente', async () => {
    const { alvo, outro, mk } = await cenario()
    await mk(alvo.id, '2026-06-10', '09:00')
    await mk(alvo.id, '2026-06-11', '23:00') // depois do corte
    const doOutro = await mk(outro.id, '2026-06-10', '09:00')
    const ate = parseDataHoraPt('11-06-2026 00:00:00')!
    const now = new Date('2026-07-01T12:00:00Z')

    expect(await marcarProdutosOuvidos(alvo.id, ate, now)).toBe(1)
    expect(await marcarProdutosOuvidos(alvo.id, ate, now)).toBe(0)

    const ouvidos = await prisma.intercecaoProduto.findMany({
      where: { alvoId: alvo.id, ouvido: true },
    })
    expect(ouvidos).toHaveLength(1)
    expect(ouvidos[0].ouvidoEm?.toISOString()).toBe(now.toISOString())

    const intacto = await prisma.intercecaoProduto.findUnique({ where: { id: doOutro.id } })
    expect(intacto?.ouvido).toBe(false)
  })
})
