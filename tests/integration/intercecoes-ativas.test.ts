import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas, makeEstado } from '../helpers/fixtures'
import { getIntercecoesAtivas } from '@/lib/estatisticas-counters'

/**
 * "Interceções ativas" das Estatísticas: nº de alvos com pelo menos uma linha
 * ainda em vigor (inquérito não terminal) e nº de produtos desses alvos.
 */

const prisma = getTestPrisma()
const NOW = new Date('2026-06-15T10:00:00Z')

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

async function criarAlvo(
  inqueritoId: string,
  userId: string,
  nome: string,
  linhas: { codigo: string; dataFim: string }[],
  produtos = 0,
) {
  const alvo = await prisma.intercecaoAlvo.create({ data: { nome, inqueritoid: inqueritoId } })
  for (const l of linhas) {
    await prisma.intercecaoLinha.create({
      data: {
        alvoId: alvo.id,
        codigo: l.codigo,
        tipo: 'SIM',
        identificador: `91${l.codigo}`,
        dataInicio: new Date('2026-01-01'),
        dataFim: new Date(l.dataFim),
      },
    })
  }
  for (let i = 0; i < produtos; i++) {
    await prisma.intercecaoProduto.create({
      data: {
        alvoId: alvo.id,
        tipo: 'CHAMADA',
        data: new Date('2026-06-01'),
        resumo: `produto ${i}`,
        criadoPorId: userId,
      },
    })
  }
  return alvo
}

describe('getIntercecoesAtivas', () => {
  test('conta alvos com linha em vigor (incl. a terminar hoje) e os seus produtos', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const [i1, i2] = s.inqA
    await criarAlvo(i1.id, s.inspetorA.id, 'Ativo', [{ codigo: '1', dataFim: '2026-09-01' }], 3)
    await criarAlvo(i1.id, s.inspetorA.id, 'Termina hoje', [{ codigo: '2', dataFim: '2026-06-15' }], 1)
    // Linhas terminadas → alvo não conta (nem os seus produtos).
    await criarAlvo(i2.id, s.inspetorA.id, 'Terminado', [{ codigo: '3', dataFim: '2026-06-14' }], 5)
    // Uma linha terminada e outra em vigor → conta uma só vez.
    await criarAlvo(
      i2.id,
      s.inspetorA.id,
      'Misto',
      [
        { codigo: '4', dataFim: '2026-01-31' },
        { codigo: '5', dataFim: '2026-12-31' },
      ],
      2,
    )

    const r = await getIntercecoesAtivas({ deletedAt: null }, NOW)
    expect(r).toEqual({ alvos: 3, produtos: 6 })
  })

  test('ignora inquéritos terminais e respeita o âmbito dado', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const arquivado = await makeEstado(prisma, { codigo: 'ARQUIVADO', nome: 'Arquivado', terminal: true })
    await prisma.inquerito.update({ where: { id: s.inqA[1].id }, data: { estadoId: arquivado.id } })

    await criarAlvo(s.inqA[0].id, s.inspetorA.id, 'A', [{ codigo: '1', dataFim: '2026-09-01' }], 2)
    await criarAlvo(s.inqA[1].id, s.inspetorA.id, 'Arquivado', [{ codigo: '2', dataFim: '2026-09-01' }], 4)
    await criarAlvo(s.inqB[0].id, s.inspetorA.id, 'B', [{ codigo: '3', dataFim: '2026-09-01' }], 1)

    expect(await getIntercecoesAtivas({ deletedAt: null }, NOW)).toEqual({ alvos: 2, produtos: 3 })
    expect(
      await getIntercecoesAtivas({ deletedAt: null, brigadaId: s.inqB[0].brigadaId }, NOW),
    ).toEqual({ alvos: 1, produtos: 1 })
  })
})
