import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'

/**
 * /api/ausencias — marcação de férias/folgas: criação com validação e deteção
 * de sobreposição, e leitura com scope (próprio, brigada do chefe).
 */

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock('@/auth', () => ({ auth: authMock }))

import { GET, POST } from '@/app/api/ausencias/route'

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
  authMock.mockReset()
})

afterAll(async () => {
  await disconnectTestPrisma()
})

function asUser(u: { id: string; role: string; brigadaId: string | null }) {
  authMock.mockResolvedValue({
    user: { id: u.id, role: u.role, brigadaId: u.brigadaId, email: 'x@test.local', nome: 'X' },
  })
}

function criar(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/ausencias', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

const ler = (qs: string) => GET(new NextRequest(`http://localhost/api/ausencias?${qs}`))

describe('POST /api/ausencias', () => {
  test('cria, recusa sobreposição do mesmo tipo e aceita outro tipo no mesmo período', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser({ id: s.inspetorA.id, role: 'INSPETOR', brigadaId: s.brigadaA.id })

    const ferias = { tipo: 'FERIAS', dataInicio: '2026-08-01', dataFim: '2026-08-15' }
    expect((await criar(ferias)).status).toBe(201)
    expect((await criar({ ...ferias, dataInicio: '2026-08-10', dataFim: '2026-08-20' })).status).toBe(409)
    expect((await criar({ tipo: 'FOLGA', dataInicio: '2026-08-05', dataFim: '2026-08-05' })).status).toBe(201)

    const row = await prisma.ausencia.findFirstOrThrow({ where: { tipo: 'FERIAS' } })
    expect(row.inspetorId).toBe(s.inspetorA.id)
    expect(row.brigadaId).toBe(s.brigadaA.id)
    expect(row.dataInicio.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(await prisma.auditLog.count({ where: { acao: 'CREATE_AUSENCIA' } })).toBe(2)
  })

  test('valida o corpo: fim antes do início e tipo desconhecido → 400', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser({ id: s.inspetorA.id, role: 'INSPETOR', brigadaId: s.brigadaA.id })
    expect((await criar({ tipo: 'FERIAS', dataInicio: '2026-08-10', dataFim: '2026-08-01' })).status).toBe(400)
    expect((await criar({ tipo: 'BAIXA', dataInicio: '2026-08-01', dataFim: '2026-08-02' })).status).toBe(400)
  })
})

describe('GET /api/ausencias — scope', () => {
  async function cenario() {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.ausencia.create({
      data: {
        inspetorId: s.inspetorA.id,
        brigadaId: s.brigadaA.id,
        tipo: 'FERIAS',
        dataInicio: new Date('2026-08-01'),
        dataFim: new Date('2026-08-05'),
      },
    })
    return s
  }

  test('o próprio vê as suas; outro inspetor não pode ver as de terceiros', async () => {
    const s = await cenario()
    asUser({ id: s.inspetorA.id, role: 'INSPETOR', brigadaId: s.brigadaA.id })
    const proprio = await (await ler('ano=2026')).json()
    expect(proprio.ausencias).toHaveLength(1)

    asUser({ id: s.inspetorB.id, role: 'INSPETOR', brigadaId: s.brigadaB.id })
    expect((await ler(`ano=2026&utilizadorId=${s.inspetorA.id}`)).status).toBe(403)
  })

  test('o chefe vê a sua brigada, mas não membros de outra brigada', async () => {
    const s = await cenario()
    asUser({ id: s.chefeA.id, role: 'INSPETOR_CHEFE', brigadaId: s.brigadaA.id })
    const membro = await ler(`ano=2026&utilizadorId=${s.inspetorA.id}`)
    expect(membro.status).toBe(200)
    expect((await membro.json()).ausencias).toHaveLength(1)

    const brigada = await (await ler('ano=2026&scope=brigade')).json()
    const inspA = brigada.membros.find((m: { id: string }) => m.id === s.inspetorA.id)
    expect(inspA.ausencias).toHaveLength(1)

    asUser({ id: s.chefeB.id, role: 'INSPETOR_CHEFE', brigadaId: s.brigadaB.id })
    expect((await ler(`ano=2026&utilizadorId=${s.inspetorA.id}`)).status).toBe(403)
  })

  test('ano inválido → 400', async () => {
    const s = await cenario()
    asUser({ id: s.inspetorA.id, role: 'INSPETOR', brigadaId: s.brigadaA.id })
    expect((await ler('ano=1800')).status).toBe(400)
  })
})
