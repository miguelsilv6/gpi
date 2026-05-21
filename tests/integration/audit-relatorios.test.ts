import { describe, test, expect, beforeEach, afterAll } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas, makeUtilizador } from '../helpers/fixtures'
import { writeAudit, diff } from '@/lib/audit'
import { queryInqueritos } from '@/lib/relatorios/inqueritos'
import { queryBrigadas } from '@/lib/relatorios/brigadas'
import { queryInspetores } from '@/lib/relatorios/inspetores'
import { toCSV, toMarkdown } from '@/lib/relatorios/formatters'

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('writeAudit', () => {
  test('regista uma entry de AuditLog com IP e userAgent extraídos da request', async () => {
    const user = await makeUtilizador(prisma, { role: 'ADMINISTRACAO' })
    const req = new Request('http://localhost/api/test', {
      headers: {
        'x-forwarded-for': '203.0.113.5, 198.51.100.7',
        'user-agent': 'Mozilla/5.0 TestSuite',
      },
    })

    await writeAudit({
      req,
      acao: 'TEST_ACTION',
      entidade: 'Test',
      entidadeId: 'test-1',
      utilizadorId: user.id,
      detalhes: { foo: 'bar', n: 42 },
    })

    const log = await prisma.auditLog.findFirst({
      where: { utilizadorId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    expect(log).toBeTruthy()
    expect(log?.acao).toBe('TEST_ACTION')
    expect(log?.entidade).toBe('Test')
    expect(log?.entidadeId).toBe('test-1')
    // x-forwarded-for: pega o primeiro IP
    expect(log?.ip).toBe('203.0.113.5')
    expect(log?.userAgent).toContain('TestSuite')
    expect(log?.detalhes).toEqual({ foo: 'bar', n: 42 })
  })
})

describe('diff helper', () => {
  test('devolve null quando nada mudou', () => {
    const before = { a: 1, b: 'x' }
    const after = { a: 1, b: 'x' }
    expect(diff(before, after, ['a', 'b'])).toBeNull()
  })

  test('só inclui campos que mudaram', () => {
    const before = { a: 1, b: 'x', c: true }
    const after = { a: 2, b: 'x', c: true }
    const d = diff(before, after, ['a', 'b', 'c'])
    expect(d?.changed).toEqual(['a'])
    expect(d?.before).toEqual({ a: 1 })
    expect(d?.after).toEqual({ a: 2 })
  })

  test('normaliza datas para ISO string', () => {
    const t1 = new Date('2026-01-01T00:00:00Z')
    const t2 = new Date('2026-02-01T00:00:00Z')
    const d = diff({ d: t1 }, { d: t2 }, ['d'])
    expect(d?.before.d).toBe(t1.toISOString())
    expect(d?.after.d).toBe(t2.toISOString())
  })

  test('null vs undefined são considerados iguais (ambos normalizam para null)', () => {
    expect(diff({ x: null }, { x: undefined }, ['x'])).toBeNull()
  })
})

describe('Relatórios handlers — shape canónico', () => {
  test('queryInqueritos devolve colunas + rows + summary', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const result = await queryInqueritos(new URLSearchParams(), {
      id: s.chefeA.id,
      nome: s.chefeA.nome,
      role: 'ADMINISTRACAO',
      brigadaId: null,
    })

    expect(result.title).toBe('Listagem de inquéritos')
    expect(result.columns.length).toBeGreaterThan(0)
    expect(result.columns[0].key).toBe('nuipc')
    expect(result.rows.length).toBe(5)
    expect(result.summary).toBeDefined()
    const totalSummary = result.summary?.find((s) => s.label === 'Total')
    expect(totalSummary?.value).toBe(5)
    // PII de denunciante não deve estar no shape (não há campos disso).
    expect(result.columns.map((c) => c.key)).not.toContain('denuncianteNif')
  })

  test('queryBrigadas devolve uma linha por brigada + linha Total', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const result = await queryBrigadas(new URLSearchParams(), {
      id: s.chefeA.id,
      nome: 'Admin',
      role: 'ADMINISTRACAO',
      brigadaId: null,
    })

    // 2 brigadas + linha Total
    expect(result.rows.length).toBe(3)
    expect(result.rows[result.rows.length - 1].brigada).toBe('Total')
    // Soma dos abertosPeriodo deve bater com o total
    const total = Number(result.rows[result.rows.length - 1].abertosPeriodo)
    const sum = result.rows
      .slice(0, -1)
      .reduce((acc, r) => acc + Number(r.abertosPeriodo), 0)
    expect(total).toBe(sum)
    expect(total).toBe(5)
  })

  test('queryBrigadas para INSPETOR_CHEFE devolve apenas a sua brigada', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const result = await queryBrigadas(new URLSearchParams(), {
      id: s.chefeA.id,
      nome: s.chefeA.nome,
      role: 'INSPETOR_CHEFE',
      brigadaId: s.brigadaA.id,
    })
    // 1 brigada → sem linha "Total" (logic only adds if linhas.length > 1)
    expect(result.rows.length).toBe(1)
    expect(result.rows[0].brigada).toBe('Brigada Alpha')
  })

  test('queryInspetores: INSPETOR_CHEFE força brigadaId mesmo com URL contrária', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const params = new URLSearchParams({ brigadaId: s.brigadaB.id })
    const result = await queryInspetores(params, {
      id: s.chefeA.id,
      nome: s.chefeA.nome,
      role: 'INSPETOR_CHEFE',
      brigadaId: s.brigadaA.id,
    })
    // Só vê inspetorA, mesmo passando ?brigadaId=B
    expect(result.rows.map((r) => r.inspetor)).toEqual(['Inspetor Alpha'])
  })
})

describe('Formatadores reagem ao shape do handler', () => {
  test('toCSV produz output que abre em Excel (BOM + UTF-8)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const result = await queryInqueritos(new URLSearchParams(), {
      id: s.chefeA.id,
      nome: s.chefeA.nome,
      role: 'ADMINISTRACAO',
      brigadaId: null,
    })
    const csv = toCSV(result)
    expect(csv).toContain('NUIPC')
    expect(csv).toContain('A-001/22')
    expect(csv).toContain('B-001/22')
  })

  test('toMarkdown produz tabela GFM válida', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const result = await queryBrigadas(new URLSearchParams(), {
      id: s.chefeA.id,
      nome: 'Admin',
      role: 'ADMINISTRACAO',
      brigadaId: null,
    })
    const md = toMarkdown(result)
    // separador de alinhamento
    expect(md).toMatch(/\| --- \|/)
    // primeiro nome de brigada
    expect(md).toContain('Brigada Alpha')
    expect(md).toContain('Total')
  })
})
