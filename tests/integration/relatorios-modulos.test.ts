import { describe, test, expect, beforeEach, afterAll } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { queryApreensoes } from '@/lib/relatorios/apreensoes'
import { queryPericias } from '@/lib/relatorios/pericias'
import { queryIntercecoes } from '@/lib/relatorios/intercecoes'
import type { RelatorioSession } from '@/lib/relatorios/types'

/**
 * Relatórios de módulo (Interceções / Apreensões / Perícias): scope RBAC via
 * `buildInqueritoWhere` na relação do inquérito, filtros (estado/tipo) e sumário.
 * Segue o cenário de duas brigadas de `scope-bypass.test.ts`.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

function q(params: Record<string, string> = {}) {
  return new URLSearchParams(params)
}

const coord: RelatorioSession = {
  id: 'coord',
  nome: 'Coord',
  role: 'COORDENADOR',
  brigadaId: null,
}
const chefeSession = (id: string, brigadaId: string): RelatorioSession => ({
  id,
  nome: 'Chefe',
  role: 'INSPETOR_CHEFE',
  brigadaId,
})

/** Seed: 1 registo de cada módulo na brigada A e na brigada B. */
async function seed() {
  const s = await scenarioTwoBrigadas(prisma)
  const inqA = s.inqA[0]
  const inqA2 = s.inqA[1]
  const inqB = s.inqB[0]

  const hoje = new Date()
  const daqui = (dias: number) => {
    const d = new Date(hoje)
    d.setDate(d.getDate() + dias)
    return d
  }

  // Apreensões: A = ARMA em custódia; B = DROGA devolvida (concluída).
  await prisma.apreensao.create({
    data: {
      descricao: 'Pistola 9mm',
      tipo: 'ARMA',
      dataApreensao: daqui(-10),
      estado: 'EM_CUSTODIA',
      inqueritoid: inqA.id,
      registadoPorId: s.inspetorA.id,
    },
  })
  await prisma.apreensao.create({
    data: {
      descricao: 'Haxixe 250g',
      tipo: 'DROGA',
      dataApreensao: daqui(-20),
      estado: 'DEVOLVIDO',
      dataDestino: daqui(-2),
      inqueritoid: inqB.id,
      registadoPorId: s.inspetorB.id,
    },
  })

  // Perícias: A = balística solicitada e ATRASADA (prevista ontem); B = ADN concluída.
  await prisma.pericia.create({
    data: {
      descricao: 'Exame balístico à pistola',
      tipo: 'BALISTICA',
      dataPedido: daqui(-15),
      dataPrevista: daqui(-1),
      estado: 'SOLICITADA',
      inqueritoid: inqA.id,
      registadoPorId: s.inspetorA.id,
    },
  })
  await prisma.pericia.create({
    data: {
      descricao: 'Perfil de ADN',
      tipo: 'ADN',
      dataPedido: daqui(-30),
      estado: 'CONCLUIDA',
      dataConclusao: daqui(-5),
      inqueritoid: inqB.id,
      registadoPorId: s.inspetorB.id,
    },
  })

  // Interceções: A tem 2 linhas (SIM a expirar +5d; OUTRO ativa +30d),
  // B tem 1 linha (IMEI já terminada -5d).
  const alvoA = await prisma.intercecaoAlvo.create({
    data: { nome: 'Suspeito Alpha', inqueritoid: inqA.id },
  })
  const alvoA2 = await prisma.intercecaoAlvo.create({
    data: { nome: 'Suspeito Alpha 2', inqueritoid: inqA2.id },
  })
  const alvoB = await prisma.intercecaoAlvo.create({
    data: { nome: 'Suspeito Bravo', inqueritoid: inqB.id },
  })
  await prisma.intercecaoLinha.create({
    data: {
      codigo: 'A1',
      tipo: 'SIM',
      identificador: '910000001',
      dataInicio: daqui(-20),
      dataFim: daqui(5),
      alvoId: alvoA.id,
    },
  })
  await prisma.intercecaoLinha.create({
    data: {
      codigo: 'A2',
      tipo: 'OUTRO',
      identificador: '910000002',
      dataInicio: daqui(-20),
      dataFim: daqui(30),
      alvoId: alvoA2.id,
    },
  })
  await prisma.intercecaoLinha.create({
    data: {
      codigo: 'B1',
      tipo: 'IMEI',
      identificador: '990000003',
      dataInicio: daqui(-40),
      dataFim: daqui(-5),
      alvoId: alvoB.id,
    },
  })

  return s
}

describe('Relatório de Apreensões', () => {
  test('scope: chefe da brigada A vê só a apreensão de A; coordenador vê ambas', async () => {
    const s = await seed()

    const doChefe = await queryApreensoes(q(), chefeSession(s.chefeA.id, s.brigadaA.id))
    expect(doChefe.rows.length).toBe(1)
    expect(doChefe.rows[0].nuipc).toBe('A-001/22')

    const doCoord = await queryApreensoes(q(), coord)
    expect(doCoord.rows.length).toBe(2)
  })

  test('filtro por tipo e por grupo de estado', async () => {
    await seed()
    const porTipo = await queryApreensoes(q({ tipo: 'DROGA' }), coord)
    expect(porTipo.rows.length).toBe(1)
    expect(porTipo.rows[0].nuipc).toBe('B-001/22')

    const emCustodia = await queryApreensoes(q({ estado: 'em-custodia' }), coord)
    expect(emCustodia.rows.map((r) => r.nuipc)).toEqual(['A-001/22'])

    const concluidas = await queryApreensoes(q({ estado: 'concluidas' }), coord)
    expect(concluidas.rows.map((r) => r.nuipc)).toEqual(['B-001/22'])
  })

  test('empty-state quando o filtro não interseta o scope', async () => {
    const s = await seed()
    const r = await queryApreensoes(q({ tipo: 'DROGA' }), chefeSession(s.chefeA.id, s.brigadaA.id))
    expect(r.rows.length).toBe(0)
    expect(r.emptyMessage).toBeTruthy()
  })
})

describe('Relatório de Perícias', () => {
  test('scope + sumário assinala atrasadas', async () => {
    const s = await seed()

    const doChefe = await queryPericias(q(), chefeSession(s.chefeA.id, s.brigadaA.id))
    expect(doChefe.rows.length).toBe(1)
    expect(doChefe.rows[0].nuipc).toBe('A-001/22')
    // A perícia de A está pendente e a data prevista já passou → atrasada.
    expect(doChefe.summary?.some((x) => x.label === 'Atrasadas' && x.value === 1)).toBe(true)

    const doCoord = await queryPericias(q(), coord)
    expect(doCoord.rows.length).toBe(2)
  })

  test('filtro por grupo de estado (concluídas)', async () => {
    await seed()
    const r = await queryPericias(q({ estado: 'concluidas' }), coord)
    expect(r.rows.map((x) => x.nuipc)).toEqual(['B-001/22'])
  })
})

describe('Relatório de Interceções', () => {
  test('scope via alvo→inquérito: chefe A vê 2 linhas de A; coordenador vê 3', async () => {
    const s = await seed()

    const doChefe = await queryIntercecoes(q(), chefeSession(s.chefeA.id, s.brigadaA.id))
    expect(doChefe.rows.length).toBe(2)
    expect(doChefe.rows.every((r) => String(r.nuipc).startsWith('A-'))).toBe(true)

    const doCoord = await queryIntercecoes(q(), coord)
    expect(doCoord.rows.length).toBe(3)
  })

  test('filtro estado: ativas (2) vs a-expirar (1) vs tipo IMEI (1)', async () => {
    await seed()

    const ativas = await queryIntercecoes(q({ estado: 'ativas' }), coord)
    expect(ativas.rows.length).toBe(2) // as 2 linhas de A (fim no futuro); a de B já terminou

    const aExpirar = await queryIntercecoes(q({ estado: 'a-expirar' }), coord)
    expect(aExpirar.rows.length).toBe(1) // só a linha SIM (+5d) entra na janela de 10d
    expect(aExpirar.rows[0].codigo).toBe('A1')

    const imei = await queryIntercecoes(q({ tipo: 'IMEI' }), coord)
    expect(imei.rows.length).toBe(1)
    expect(imei.rows[0].estado).toBe('Terminada')
  })
})
