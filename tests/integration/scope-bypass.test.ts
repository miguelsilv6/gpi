import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { queryInqueritos } from '@/lib/relatorios/inqueritos'

/**
 * Teste de regressão para o bug crítico fixado no Sprint Relatórios:
 *
 *   INSPETOR_CHEFE conseguia consultar inquéritos de OUTRA brigada
 *   passando `?brigadaId=<outra>` na URL. Causa: `...roleWhere` era
 *   espalhado ANTES dos filtros do URL, pelo que as chaves do URL
 *   substituíam as do scope-locking.
 *
 *   Fix (evoluído): o scope (`roleWhere`) é composto por AND com os filtros
 *   do URL — nunca por spread ao mesmo nível. Isto é obrigatório desde que o
 *   scope do INSPETOR passou a poder conter um `OR` (colaborações), que
 *   colidiria com um spread. Efeito: um filtro fora do âmbito devolve vazio
 *   (não os dados do próprio), o que é ainda mais restritivo — e seguro.
 *
 * Estes testes invocam o handler do relatório directamente com query strings
 * forjadas e validam que o scope nunca é furado, independentemente do que o
 * URL contém.
 */

const prisma = getTestPrisma()

beforeAll(async () => {
  // Garantir schema antes do primeiro teste (db push é idempotente).
  // Em CI já fica feito pelo workflow; localmente serve de safety-net.
})

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('Scope-bypass (regression for task #91)', () => {
  test('INSPETOR_CHEFE só vê inquéritos da sua brigada (sem filtros)', async () => {
    const s = await scenarioTwoBrigadas(prisma)

    const result = await queryInqueritos(new URLSearchParams(), {
      id: s.chefeA.id,
      nome: s.chefeA.nome,
      role: 'INSPETOR_CHEFE',
      brigadaId: s.brigadaA.id,
    })

    expect(result.rows.length).toBe(2) // 2 inquéritos em A
    const nuipcs = result.rows.map((r) => String(r.nuipc)).sort()
    expect(nuipcs).toEqual(['A-001/22', 'A-002/22'])
  })

  test('INSPETOR_CHEFE NÃO vê dados de outra brigada via ?brigadaId=B (URL ignorada)', async () => {
    const s = await scenarioTwoBrigadas(prisma)

    // Tentativa de injecção: chefe da brigada A passa brigadaId=B no URL.
    const params = new URLSearchParams({ brigadaId: s.brigadaB.id })
    const result = await queryInqueritos(params, {
      id: s.chefeA.id,
      nome: s.chefeA.nome,
      role: 'INSPETOR_CHEFE',
      brigadaId: s.brigadaA.id,
    })

    // O scope é composto por AND (roleWhere sempre aplicado): um ?brigadaId
    // fora do âmbito não é "override-last" para os próprios — passa a ser um
    // filtro real DENTRO do scope, que aqui não interseta nada (brigada A ∩
    // brigada B = ∅). Resultado seguro: 0 registos, nenhum da B.
    const nuipcs = result.rows.map((r) => r.nuipc)
    expect(result.rows.length).toBe(0)
    expect(nuipcs).not.toContain('B-001/22')
    expect(nuipcs).not.toContain('B-002/22')
    expect(nuipcs).not.toContain('B-003/22')
  })

  test('INSPETOR NÃO vê inquéritos doutro inspetor via ?inspetorId=X (URL ignorada)', async () => {
    const s = await scenarioTwoBrigadas(prisma)

    // Inspetor da brigada A tenta passar inspetorId do inspetor da brigada B.
    const params = new URLSearchParams({ inspetorId: s.inspetorB.id })
    const result = await queryInqueritos(params, {
      id: s.inspetorA.id,
      nome: s.inspetorA.nome,
      role: 'INSPETOR',
      brigadaId: s.brigadaA.id,
    })

    // Scope por AND: o ?inspetorId alheio é filtrado DENTRO do âmbito do
    // inspetor (os seus + colaborações). Como não é titular nem colaborador
    // de nada do inspetorB, o resultado é vazio — e nunca dados alheios.
    expect(result.rows.length).toBe(0)
    const inspetores = new Set(result.rows.map((r) => r.inspetor))
    expect(inspetores.has('Inspetor Bravo')).toBe(false)
  })

  test('INSPETOR vê apenas os próprios sem filtros', async () => {
    const s = await scenarioTwoBrigadas(prisma)

    const result = await queryInqueritos(new URLSearchParams(), {
      id: s.inspetorA.id,
      nome: s.inspetorA.nome,
      role: 'INSPETOR',
      brigadaId: s.brigadaA.id,
    })

    expect(result.rows.length).toBe(2) // ambos os inquéritos de A atribuídos a inspetorA
    const inspetores = new Set(result.rows.map((r) => r.inspetor))
    expect(inspetores).toEqual(new Set(['Inspetor Alpha']))
  })

  test('COORDENADOR vê tudo + respeita filtros (não tem scope-lock)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const coord = await prisma.utilizador.create({
      data: {
        nome: 'Coord',
        email: 'coord@test.local',
        passwordHash: 'x',
        role: 'COORDENADOR',
      },
    })

    // Sem filtros: vê os 5 (2A + 3B).
    const all = await queryInqueritos(new URLSearchParams(), {
      id: coord.id,
      nome: coord.nome,
      role: 'COORDENADOR',
      brigadaId: null,
    })
    expect(all.rows.length).toBe(5)

    // Com brigadaId=A: filtra para 2. Para COORDENADOR o URL filter é
    // legítimo (não é bypass).
    const justA = await queryInqueritos(
      new URLSearchParams({ brigadaId: s.brigadaA.id }),
      { id: coord.id, nome: coord.nome, role: 'COORDENADOR', brigadaId: null },
    )
    expect(justA.rows.length).toBe(2)
  })

  test('ADMINISTRACAO ignora scope-lock e respeita filtros', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const admin = await prisma.utilizador.create({
      data: {
        nome: 'Admin',
        email: 'admin@test.local',
        passwordHash: 'x',
        role: 'ADMINISTRACAO',
      },
    })

    const result = await queryInqueritos(
      new URLSearchParams({ brigadaId: s.brigadaB.id }),
      { id: admin.id, nome: admin.nome, role: 'ADMINISTRACAO', brigadaId: null },
    )
    expect(result.rows.length).toBe(3) // todos da brigada B
  })

  test('INSPETOR_CHEFE sem brigada (misconfig) fail-closed devolve 0', async () => {
    await scenarioTwoBrigadas(prisma)
    const chefeSemBrigada = await prisma.utilizador.create({
      data: {
        nome: 'Chefe sem brigada',
        email: 'orfao@test.local',
        passwordHash: 'x',
        role: 'INSPETOR_CHEFE',
        brigadaId: null,
      },
    })

    const result = await queryInqueritos(new URLSearchParams(), {
      id: chefeSemBrigada.id,
      nome: chefeSemBrigada.nome,
      role: 'INSPETOR_CHEFE',
      brigadaId: null,
    })

    expect(result.rows.length).toBe(0)
  })
})
