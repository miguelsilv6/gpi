import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas, makeEstado, makeBrigada } from '../helpers/fixtures'

/**
 * POST /api/inqueritos/transfer — transferência de inquérito entre brigadas:
 * permissão, regras (mesma brigada, estado terminal, brigada inativa),
 * efeitos (remove o inspetor, ABERTO → DISTRIBUIDO) e auditoria.
 */

process.env.DISABLE_EMAIL = 'true'

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock('@/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { POST } from '@/app/api/inqueritos/transfer/route'

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

function transfer(nuipc: string, brigadaId: string) {
  return POST(
    new NextRequest('http://localhost/api/inqueritos/transfer', {
      method: 'POST',
      body: JSON.stringify({ nuipc, brigadaId }),
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

async function coordenador() {
  return prisma.utilizador.create({
    data: { nome: 'Coord', email: 'coord@test.local', passwordHash: 'x', role: 'COORDENADOR' },
  })
}

describe('POST /api/inqueritos/transfer', () => {
  test('COORDENADOR transfere: muda a brigada, remove o inspetor, ABERTO → DISTRIBUIDO e audita', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const distribuido = await makeEstado(prisma, { codigo: 'DISTRIBUIDO', nome: 'Distribuído' })
    const coord = await coordenador()
    asUser({ id: coord.id, role: 'COORDENADOR', brigadaId: null })

    const inq = s.inqA[0]
    const res = await transfer(inq.nuipc, s.brigadaB.id)
    expect(res.status).toBe(200)

    const depois = await prisma.inquerito.findUniqueOrThrow({ where: { id: inq.id } })
    expect(depois.brigadaId).toBe(s.brigadaB.id)
    expect(depois.inspetorId).toBeNull()
    expect(depois.estadoId).toBe(distribuido.id)

    const audit = await prisma.auditLog.findFirst({ where: { acao: 'TRANSFER_INQUERITO', entidadeId: inq.id } })
    expect(audit?.utilizadorId).toBe(coord.id)
  })

  test('INSPETOR não tem permissão (403) e nada muda', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser({ id: s.inspetorA.id, role: 'INSPETOR', brigadaId: s.brigadaA.id })
    const res = await transfer(s.inqA[0].nuipc, s.brigadaB.id)
    expect(res.status).toBe(403)
    const inq = await prisma.inquerito.findUniqueOrThrow({ where: { id: s.inqA[0].id } })
    expect(inq.brigadaId).toBe(s.brigadaA.id)
  })

  test('recusa a mesma brigada, estado terminal e brigada inativa (409)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const coord = await coordenador()
    asUser({ id: coord.id, role: 'COORDENADOR', brigadaId: null })

    expect((await transfer(s.inqA[0].nuipc, s.brigadaA.id)).status).toBe(409)

    const arquivado = await makeEstado(prisma, { codigo: 'ARQUIVADO', nome: 'Arquivado', terminal: true })
    await prisma.inquerito.update({ where: { id: s.inqA[1].id }, data: { estadoId: arquivado.id } })
    expect((await transfer(s.inqA[1].nuipc, s.brigadaB.id)).status).toBe(409)

    const inativa = await makeBrigada(prisma, { nome: 'Inativa', ativa: false })
    expect((await transfer(s.inqA[0].nuipc, inativa.id)).status).toBe(409)
  })

  test('inquérito inexistente → 404; corpo inválido → 400', async () => {
    await scenarioTwoBrigadas(prisma)
    const coord = await coordenador()
    asUser({ id: coord.id, role: 'COORDENADOR', brigadaId: null })
    expect((await transfer('NAO-EXISTE/99', 'x')).status).toBe(404)
    expect((await transfer('', '')).status).toBe(400)
  })
})
