import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { nuipcToSlug } from '@/lib/utils'
import { NextRequest } from 'next/server'

/**
 * Testes de integração das rotas de intervenientes contra a BD real, exercendo
 * os handlers HTTP diretamente com a sessão mockada. Foco: os gates de
 * permissão (mesma regra do denunciante — titular/hierarquia), a proteção
 * contra IDs cruzados e a limpeza do `responsavel` conforme a natureza.
 */

// Mock da sessão: `auth()` devolve o que definirmos por teste.
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock('@/auth', () => ({ auth: authMock }))

// Importar as rotas DEPOIS do mock estar registado.
import { POST } from '@/app/api/inqueritos/[nuipc]/intervenientes/route'
import { PUT, DELETE } from '@/app/api/inqueritos/[nuipc]/intervenientes/[id]/route'

const prisma = getTestPrisma()

function asUser(u: { id: string; role: string; brigadaId: string | null }) {
  authMock.mockResolvedValue({
    user: { id: u.id, role: u.role, brigadaId: u.brigadaId, email: 'x@test.local', nome: 'X' },
  })
}

function jsonReq(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api', {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

// Handlers de coleção (só nuipc) vs de item (nuipc + id) — tipados em separado
// para satisfazer a assinatura de cada rota.
const params = (nuipc: string) => ({ params: Promise.resolve({ nuipc: nuipcToSlug(nuipc) }) })
const paramsId = (nuipc: string, id: string) => ({
  params: Promise.resolve({ nuipc: nuipcToSlug(nuipc), id }),
})

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('POST intervenientes — gate de criação', () => {
  test('titular cria (201) e o interveniente fica no inquérito', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser(s.inspetorA)
    const res = await POST(jsonReq('POST', { tipo: 'LESADO', nome: 'Maria Lesada' }), params(s.inqA[0].nuipc))
    expect(res.status).toBe(201)
    const rows = await prisma.interveniente.findMany({ where: { inqueritoid: s.inqA[0].id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].nome).toBe('Maria Lesada')
  })

  test('chefe da própria brigada cria (201)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser(s.chefeA)
    const res = await POST(jsonReq('POST', { tipo: 'TESTEMUNHA', nome: 'João' }), params(s.inqA[0].nuipc))
    expect(res.status).toBe(201)
  })

  test('inspetor de outra brigada: 404 (nem sabe que existe)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser(s.inspetorB)
    const res = await POST(jsonReq('POST', { tipo: 'LESADO', nome: 'X' }), params(s.inqA[0].nuipc))
    expect(res.status).toBe(404)
    expect(await prisma.interveniente.count()).toBe(0)
  })

  test('colaborador autorizado LÊ o inquérito mas NÃO gere intervenientes (403)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    // inspetorB passa a colaborador de inqA[0] (titular inspetorA).
    await prisma.inqueritoColaborador.create({
      data: { inqueritoid: s.inqA[0].id, colaboradorId: s.inspetorB.id, concedidoPorId: s.inspetorA.id },
    })
    asUser(s.inspetorB)
    const res = await POST(jsonReq('POST', { tipo: 'LESADO', nome: 'X' }), params(s.inqA[0].nuipc))
    expect(res.status).toBe(403)
    expect(await prisma.interveniente.count()).toBe(0)
  })

  test('tipo OUTRO sem descrição: 400', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser(s.inspetorA)
    const res = await POST(jsonReq('POST', { tipo: 'OUTRO', nome: 'X' }), params(s.inqA[0].nuipc))
    expect(res.status).toBe(400)
  })
})

describe('PUT/DELETE intervenientes — cross-ID e integridade', () => {
  async function criarInterveniente(inqId: string, data: Record<string, unknown> = {}) {
    return prisma.interveniente.create({
      data: { inqueritoid: inqId, tipo: 'LESADO', nome: 'Base', ...data },
    })
  }

  test('PUT com o interveniente de OUTRO inquérito no URL: 404 (cross-ID)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const intv = await criarInterveniente(s.inqA[0].id)
    asUser(s.inspetorA)
    // NUIPC do inqA[1], mas o id pertence ao inqA[0] → não encontra.
    const res = await PUT(
      jsonReq('PUT', { tipo: 'LESADO', nome: 'Alterado' }),
      paramsId(s.inqA[1].nuipc, intv.id),
    )
    expect(res.status).toBe(404)
    const after = await prisma.interveniente.findUnique({ where: { id: intv.id } })
    expect(after?.nome).toBe('Base') // não foi alterado
  })

  test('PUT limpa `responsavel` quando a natureza passa a singular', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const intv = await criarInterveniente(s.inqA[0].id, {
      tipoPessoa: 'COLETIVA',
      responsavel: 'Dr. Fulano',
    })
    asUser(s.inspetorA)
    const res = await PUT(
      jsonReq('PUT', { tipo: 'LESADO', nome: 'Base', tipoPessoa: 'SINGULAR', responsavel: 'Dr. Fulano' }),
      paramsId(s.inqA[0].nuipc, intv.id),
    )
    expect(res.status).toBe(200)
    const after = await prisma.interveniente.findUnique({ where: { id: intv.id } })
    expect(after?.responsavel).toBeNull()
  })

  test('DELETE remove; e um DELETE de outro inspetor (alheio) dá 404', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const intv = await criarInterveniente(s.inqA[0].id)

    // Inspetor de outra brigada não vê o inquérito → 404, e nada é apagado.
    asUser(s.inspetorB)
    const resAlheio = await DELETE(jsonReq('DELETE'), paramsId(s.inqA[0].nuipc, intv.id))
    expect(resAlheio.status).toBe(404)
    expect(await prisma.interveniente.count()).toBe(1)

    // Titular apaga com sucesso.
    asUser(s.inspetorA)
    const resOk = await DELETE(jsonReq('DELETE'), paramsId(s.inqA[0].nuipc, intv.id))
    expect(resOk.status).toBe(200)
    expect(await prisma.interveniente.count()).toBe(0)
  })
})
