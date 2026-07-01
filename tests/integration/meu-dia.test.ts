import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { getMeuDia } from '@/lib/meu-dia'

/**
 * "O meu dia" (dashboard). Garante:
 *  - split hoje/amanhã dos eventos de agenda;
 *  - contagens de atrasados com o âmbito certo por role;
 *  - tarefas pessoais em aberto (nunca as de outros; concluídas fora).
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

/** Data local de hoje às `h` horas, deslocada `dias`. */
function at(dias: number, h = 10): Date {
  const d = new Date()
  d.setHours(h, 0, 0, 0)
  d.setDate(d.getDate() + dias)
  return d
}

describe('getMeuDia', () => {
  test('separa eventos de hoje e de amanhã e conta atrasados', async () => {
    const s = await scenarioTwoBrigadas(prisma)

    // Diligência hoje e outra amanhã (criadas pelo inspetor A).
    await prisma.diligencia.create({
      data: { titulo: 'Julgamento hoje', dataInicio: at(0), criadoPorId: s.inspetorA.id, inqueritoId: s.inqA[0].id },
    })
    await prisma.diligencia.create({
      data: { titulo: 'Inquirição amanhã', dataInicio: at(1), criadoPorId: s.inspetorA.id },
    })
    // Prazo de inquérito vencido (ontem) no âmbito do inspetor A.
    await prisma.inquerito.update({
      where: { id: s.inqA[0].id },
      data: { dataPrazo: at(-1) },
    })
    // Atividade com prazo vencido, pendente, do inspetor A.
    await prisma.atividade.create({
      data: {
        descricao: 'Relatório em atraso',
        dataRealizacao: at(-10),
        dataPrazo: at(-2),
        inqueritoid: s.inqA[0].id,
        utilizadorId: s.inspetorA.id,
      },
    })

    const dia = await getMeuDia('INSPETOR', s.inspetorA.id, s.brigadaA.id)

    expect(dia.hoje.map((e) => e.titulo)).toEqual(['Julgamento hoje'])
    expect(dia.amanha.map((e) => e.titulo)).toEqual(['Inquirição amanhã'])
    expect(dia.atrasados.prazos).toBe(1)
    expect(dia.atrasados.atividades).toBe(1)
    expect(dia.atrasados.controlos).toBe(0)
  })

  test('tarefas: só as próprias, em aberto, com as de maior prioridade primeiro', async () => {
    const s = await scenarioTwoBrigadas(prisma)

    await prisma.tarefaInquerito.create({
      data: { titulo: 'Minha normal', prioridade: 'NORMAL', autorId: s.inspetorA.id, inqueritoId: s.inqA[0].id },
    })
    await prisma.tarefaInquerito.create({
      data: { titulo: 'Minha alta', prioridade: 'ALTA', autorId: s.inspetorA.id, inqueritoId: s.inqA[0].id },
    })
    await prisma.tarefaInquerito.create({
      data: { titulo: 'Minha concluída', prioridade: 'ALTA', concluida: true, autorId: s.inspetorA.id, inqueritoId: s.inqA[0].id },
    })
    await prisma.tarefaInquerito.create({
      data: { titulo: 'De outro', prioridade: 'ALTA', autorId: s.inspetorB.id, inqueritoId: s.inqB[0].id },
    })

    const dia = await getMeuDia('INSPETOR', s.inspetorA.id, s.brigadaA.id)

    expect(dia.tarefas.map((t) => t.titulo)).toEqual(['Minha alta', 'Minha normal'])
    expect(dia.tarefasTotal).toBe(2)
    expect(dia.tarefas[0].slug).toBeTruthy()
  })

  test('âmbito por role: inspetor não vê atrasados de outra brigada; chefe vê os da sua', async () => {
    const s = await scenarioTwoBrigadas(prisma)

    // Prazo vencido num inquérito da brigada B.
    await prisma.inquerito.update({
      where: { id: s.inqB[0].id },
      data: { dataPrazo: at(-3) },
    })

    const diaInspA = await getMeuDia('INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(diaInspA.atrasados.prazos).toBe(0)

    const diaChefeB = await getMeuDia('INSPETOR_CHEFE', s.chefeB.id, s.brigadaB.id)
    expect(diaChefeB.atrasados.prazos).toBe(1)

    const diaCoord = await getMeuDia('COORDENADOR', s.chefeA.id, null)
    expect(diaCoord.atrasados.prazos).toBe(1)
  })

  test('eventos de inquéritos soft-deleted não aparecem', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.diligencia.create({
      data: { titulo: 'De inquérito apagado', dataInicio: at(0), criadoPorId: s.inspetorA.id, inqueritoId: s.inqA[1].id },
    })
    await prisma.tarefaInquerito.create({
      data: { titulo: 'Tarefa de apagado', autorId: s.inspetorA.id, inqueritoId: s.inqA[1].id },
    })
    await prisma.inquerito.update({ where: { id: s.inqA[1].id }, data: { deletedAt: new Date() } })

    const dia = await getMeuDia('INSPETOR', s.inspetorA.id, s.brigadaA.id)
    expect(dia.hoje).toHaveLength(0)
    expect(dia.tarefasTotal).toBe(0)
  })
})
