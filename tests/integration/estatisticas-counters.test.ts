import { describe, test, expect, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeBrigada, makeEstado, makeUtilizador } from '../helpers/fixtures'
import { getInqueritoCounters } from '@/lib/estatisticas-counters'

/**
 * Os 8 contadores-resumo partilhados pela página de Estatísticas e pelo
 * Dashboard (chefe e superiores). Cobrem a contagem correta por estado/flag e
 * o âmbito por brigada.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

async function cenario() {
  const brigada = await makeBrigada(prisma, { nome: 'Brigada A' })
  const outra = await makeBrigada(prisma, { nome: 'Brigada B' })
  const distribuido = await makeEstado(prisma, { codigo: 'DISTRIBUIDO', nome: 'Distribuído', terminal: false })
  const emInvest = await makeEstado(prisma, { codigo: 'EM_INVESTIGACAO', nome: 'Em Investigação', terminal: false })
  const arquivado = await makeEstado(prisma, { codigo: 'ARQUIVADO', nome: 'Arquivado', terminal: true })
  const inspetor = await makeUtilizador(prisma, { role: 'INSPETOR', brigadaId: brigada.id })

  await prisma.atividadePadrao.createMany({
    data: [
      { nome: 'Exame laboratorial', ativa: true, categoriaDashboard: 'AGUARDA_EXAMES' },
      { nome: 'Ofício enviado', ativa: true, categoriaDashboard: 'ENVIADO' },
    ],
  })

  async function novoInquerito(args: {
    nuipc: string
    estadoId: string
    inspetorId?: string | null
    cartaPrecatoria?: boolean
    atividade?: string
  }) {
    const inq = await prisma.inquerito.create({
      data: {
        nuipc: args.nuipc,
        natureza: 'Teste',
        dataAbertura: new Date(),
        estadoId: args.estadoId,
        brigadaId: brigada.id,
        inspetorId: args.inspetorId ?? null,
        cartaPrecatoria: args.cartaPrecatoria ?? false,
      },
    })
    if (args.atividade) {
      await prisma.atividade.create({
        data: { descricao: args.atividade, inqueritoid: inq.id, utilizadorId: inspetor.id, concluidaEm: null },
      })
    }
    return inq
  }

  await novoInquerito({ nuipc: 'A-1/24', estadoId: distribuido.id, inspetorId: inspetor.id })
  await novoInquerito({ nuipc: 'A-2/24', estadoId: emInvest.id, inspetorId: null, cartaPrecatoria: true })
  await novoInquerito({ nuipc: 'A-3/24', estadoId: arquivado.id, inspetorId: inspetor.id })
  await novoInquerito({ nuipc: 'A-4/24', estadoId: emInvest.id, inspetorId: inspetor.id, atividade: 'Exame laboratorial' })
  await novoInquerito({ nuipc: 'A-5/24', estadoId: emInvest.id, inspetorId: inspetor.id, atividade: 'Ofício enviado' })

  return { brigada, outra }
}

describe('getInqueritoCounters', () => {
  test('conta corretamente cada um dos 8 contadores (âmbito global)', async () => {
    await cenario()
    const where = { deletedAt: null }
    const c = await getInqueritoCounters(where, where)

    expect(c.total).toBe(5)
    expect(c.cartaPrecatoria).toBe(1) // A-2
    expect(c.ativos).toBe(4) // todos menos o arquivado (A-3)
    expect(c.semInspetor).toBe(1) // A-2 (ativo, sem inspetor)
    expect(c.distribuido).toBe(1) // A-1
    expect(c.arquivados).toBe(1) // A-3
    expect(c.aguardaExames).toBe(1) // A-4
    expect(c.enviados).toBe(1) // A-5
  })

  test('respeita o âmbito por brigada (outra brigada vê 0)', async () => {
    const { outra } = await cenario()
    const where = { deletedAt: null, brigadaId: outra.id }
    const c = await getInqueritoCounters(where, where)

    expect(c.total).toBe(0)
    expect(c.ativos).toBe(0)
    expect(c.aguardaExames).toBe(0)
    expect(c.enviados).toBe(0)
  })

  test('exclui inquéritos soft-deleted do total', async () => {
    await cenario()
    await prisma.inquerito.update({ where: { nuipc: 'A-1/24' }, data: { deletedAt: new Date() } })
    const where = { deletedAt: null }
    const c = await getInqueritoCounters(where, where)

    expect(c.total).toBe(4)
    expect(c.distribuido).toBe(0) // A-1 era o único distribuído
  })
})
