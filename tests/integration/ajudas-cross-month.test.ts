import { describe, test, expect, beforeEach, afterAll } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeUtilizador } from '../helpers/fixtures'
import { loadCrossMonthLinhas } from '@/lib/ajudas-cross-month'

/**
 * Ajudas mensais: uma prevenção passiva cujo intervalo atravessa a fronteira de
 * dois meses tem de ser apresentada em AMBOS os meses. A entrada vive no registo
 * do mês de início (entrada própria) e, para os outros meses que abrange, é
 * carregada como "cross-month" via loadCrossMonthLinhas.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('loadCrossMonthLinhas — prevenção que atravessa dois meses', () => {
  test('uma prevenção de Maio que entra em Junho aparece na vista de Junho, não na de Maio', async () => {
    const user = await makeUtilizador(prisma, { role: 'INSPETOR' })
    const maio = await prisma.ajudasRegisto.create({ data: { utilizadorId: user.id, ano: 2025, mes: 5 } })
    const junho = await prisma.ajudasRegisto.create({ data: { utilizadorId: user.id, ano: 2025, mes: 6 } })

    // Prevenção passiva 29/05 → 02/06 (atravessa a fronteira), no registo de Maio.
    const prev = await prisma.ajudasLinha.create({
      data: {
        registoId: maio.id,
        dataInicio: new Date(Date.UTC(2025, 4, 29, 0, 0, 0, 0)),
        dataFim: new Date(Date.UTC(2025, 5, 2, 23, 59, 0, 0)),
        prevencao: 'PREVENCAO_PASSIVA',
        prevencaoOnly: true,
      },
    })
    // Horas extra só em Maio — não deve cruzar para Junho.
    await prisma.ajudasLinha.create({
      data: {
        registoId: maio.id,
        dataInicio: new Date(Date.UTC(2025, 4, 15, 18, 0, 0, 0)),
        dataFim: new Date(Date.UTC(2025, 4, 15, 22, 0, 0, 0)),
        prevencao: 'NENHUMA',
      },
    })

    // Vista de Junho: só a prevenção de Maio entra como cross-month.
    const crossJunho = await loadCrossMonthLinhas(user.id, 2025, 6, junho.id)
    expect(crossJunho).toHaveLength(1)
    expect(crossJunho[0]!.id).toBe(prev.id)

    // Vista de Maio: a prevenção é entrada PRÓPRIA do registo de Maio (excluída
    // por ser o registo corrente), logo não aparece como cross-month.
    const crossMaio = await loadCrossMonthLinhas(user.id, 2025, 5, maio.id)
    expect(crossMaio).toHaveLength(0)
  })

  test('uma prevenção contida num só mês não aparece como cross-month no mês seguinte', async () => {
    const user = await makeUtilizador(prisma, { role: 'INSPETOR' })
    const maio = await prisma.ajudasRegisto.create({ data: { utilizadorId: user.id, ano: 2025, mes: 5 } })
    const junho = await prisma.ajudasRegisto.create({ data: { utilizadorId: user.id, ano: 2025, mes: 6 } })

    await prisma.ajudasLinha.create({
      data: {
        registoId: maio.id,
        dataInicio: new Date(Date.UTC(2025, 4, 10, 0, 0, 0, 0)),
        dataFim: new Date(Date.UTC(2025, 4, 12, 23, 59, 0, 0)),
        prevencao: 'PREVENCAO_PASSIVA',
        prevencaoOnly: true,
      },
    })

    const crossJunho = await loadCrossMonthLinhas(user.id, 2025, 6, junho.id)
    expect(crossJunho).toHaveLength(0)
  })
})
