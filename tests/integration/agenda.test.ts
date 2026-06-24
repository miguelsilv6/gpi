import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { getAgendaEvents } from '@/lib/agenda'

/**
 * Agenda — agregação das 4 fontes (prazos de inquérito, atividades, controlos,
 * diligências) e âmbito por role das diligências.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

const now = new Date()
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
const mid = new Date(now.getFullYear(), now.getMonth(), 15, 10, 0, 0)

describe('getAgendaEvents — agregação', () => {
  test('reúne prazo de inquérito, atividade, controlo e diligência', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const inq = s.inqA[0]

    await prisma.inquerito.update({ where: { id: inq.id }, data: { dataPrazo: mid } })
    await prisma.atividade.create({
      data: { descricao: 'Relatório', dataPrazo: mid, inqueritoid: inq.id, utilizadorId: s.inspetorA.id },
    })
    await prisma.controlo.create({
      data: {
        descricao: 'Controlo mensal',
        dataInicio: mid,
        criadorId: s.inspetorA.id,
        inqueritoid: inq.id,
        realizacoes: { create: { numero: 1, dataEsperada: mid } },
      },
    })
    await prisma.diligencia.create({
      data: { titulo: 'Julgamento', tipo: 'JULGAMENTO', dataInicio: mid, inqueritoId: inq.id, criadoPorId: s.inspetorA.id },
    })

    const events = await getAgendaEvents('INSPETOR', s.inspetorA.id, s.brigadaA.id, monthStart, monthEnd)
    const tipos = events.map((e) => e.tipo).sort()
    expect(tipos).toEqual(['atividade', 'controlo', 'diligencia', 'inquerito'])
  })

  test('não inclui eventos fora do intervalo do mês', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const proximoMes = new Date(now.getFullYear(), now.getMonth() + 1, 10)
    await prisma.diligencia.create({
      data: { titulo: 'Fora do mês', dataInicio: proximoMes, criadoPorId: s.inspetorA.id },
    })
    const events = await getAgendaEvents('INSPETOR', s.inspetorA.id, s.brigadaA.id, monthStart, monthEnd)
    expect(events).toHaveLength(0)
  })

  test('exclui controlo/diligência de inquérito eliminado, mantém os sem inquérito', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const inq = s.inqA[0]

    // Ligados ao inquérito.
    await prisma.controlo.create({
      data: {
        descricao: 'Controlo do inquérito',
        dataInicio: mid,
        criadorId: s.inspetorA.id,
        inqueritoid: inq.id,
        realizacoes: { create: { numero: 1, dataEsperada: mid } },
      },
    })
    await prisma.diligencia.create({
      data: { titulo: 'Diligência do inquérito', dataInicio: mid, inqueritoId: inq.id, criadoPorId: s.inspetorA.id },
    })
    // Sem inquérito (standalone).
    await prisma.controlo.create({
      data: {
        descricao: 'Controlo solto',
        dataInicio: mid,
        criadorId: s.inspetorA.id,
        realizacoes: { create: { numero: 1, dataEsperada: mid } },
      },
    })
    await prisma.diligencia.create({
      data: { titulo: 'Diligência solta', dataInicio: mid, criadoPorId: s.inspetorA.id },
    })

    // Antes de eliminar: 2 controlos + 2 diligências.
    let events = await getAgendaEvents('INSPETOR', s.inspetorA.id, s.brigadaA.id, monthStart, monthEnd)
    expect(events.filter((e) => e.tipo === 'controlo')).toHaveLength(2)
    expect(events.filter((e) => e.tipo === 'diligencia')).toHaveLength(2)

    // Soft-delete do inquérito.
    await prisma.inquerito.update({ where: { id: inq.id }, data: { deletedAt: new Date() } })

    events = await getAgendaEvents('INSPETOR', s.inspetorA.id, s.brigadaA.id, monthStart, monthEnd)
    const controlos = events.filter((e) => e.tipo === 'controlo')
    const diligencias = events.filter((e) => e.tipo === 'diligencia')
    expect(controlos).toHaveLength(1)
    expect(controlos[0].titulo).toContain('Controlo solto')
    expect(diligencias).toHaveLength(1)
    expect(diligencias[0].titulo).toBe('Diligência solta')
  })
})

describe('getAgendaEvents — âmbito das diligências', () => {
  test('diligência ligada a inquérito da brigada respeita o scope', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.diligencia.create({
      data: { titulo: 'Busca', tipo: 'BUSCA', dataInicio: mid, inqueritoId: s.inqA[0].id, criadoPorId: s.chefeA.id },
    })

    // Inspetor A (titular do inquérito) vê.
    const a = await getAgendaEvents('INSPETOR', s.inspetorA.id, s.brigadaA.id, monthStart, monthEnd)
    expect(a.filter((e) => e.tipo === 'diligencia')).toHaveLength(1)

    // Chefe A (brigada) vê.
    const chefe = await getAgendaEvents('INSPETOR_CHEFE', s.chefeA.id, s.brigadaA.id, monthStart, monthEnd)
    expect(chefe.filter((e) => e.tipo === 'diligencia')).toHaveLength(1)

    // Inspetor B (outra brigada) NÃO vê.
    const b = await getAgendaEvents('INSPETOR', s.inspetorB.id, s.brigadaB.id, monthStart, monthEnd)
    expect(b.filter((e) => e.tipo === 'diligencia')).toHaveLength(0)

    // Coordenador (global) vê.
    const coord = await getAgendaEvents('COORDENADOR', s.chefeA.id, null, monthStart, monthEnd)
    expect(coord.filter((e) => e.tipo === 'diligencia')).toHaveLength(1)
  })

  test('diligência sem inquérito é privada do criador (exceto read-all)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.diligencia.create({
      data: { titulo: 'Nota pessoal', dataInicio: mid, criadoPorId: s.inspetorA.id },
    })

    const dono = await getAgendaEvents('INSPETOR', s.inspetorA.id, s.brigadaA.id, monthStart, monthEnd)
    expect(dono.filter((e) => e.tipo === 'diligencia')).toHaveLength(1)

    const chefe = await getAgendaEvents('INSPETOR_CHEFE', s.chefeA.id, s.brigadaA.id, monthStart, monthEnd)
    expect(chefe.filter((e) => e.tipo === 'diligencia')).toHaveLength(0)

    const coord = await getAgendaEvents('COORDENADOR', s.chefeB.id, null, monthStart, monthEnd)
    expect(coord.filter((e) => e.tipo === 'diligencia')).toHaveLength(1)
  })
})
