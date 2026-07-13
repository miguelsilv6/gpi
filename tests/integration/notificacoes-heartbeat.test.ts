import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeUtilizador } from '../helpers/fixtures'
import { NextRequest } from 'next/server'

/**
 * O indicador "online agora" em /utilizadores deriva de um heartbeat de
 * atividade: como as sessões são JWT (sem registo em BD), o sino sonda
 * `/api/notificacoes?count=true` a cada ~90s e essa sondagem actualiza
 * `lastSeenAt`. Estes testes fixam esse contrato:
 *  - o caminho `count=true` actualiza `lastSeenAt`;
 *  - o caminho normal (lista) NÃO o actualiza (mantém o heartbeat barato e
 *    restrito à sondagem do sino).
 */

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock('@/auth', () => ({ auth: authMock }))

import { GET } from '@/app/api/notificacoes/route'

const prisma = getTestPrisma()

function asUser(id: string) {
  authMock.mockResolvedValue({
    user: { id, role: 'INSPETOR', brigadaId: null, email: 'x@test.local', nome: 'X' },
  })
}

beforeEach(async () => {
  await resetDatabase(prisma)
  authMock.mockReset()
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('heartbeat de atividade via /api/notificacoes', () => {
  test('count=true actualiza lastSeenAt (de null para agora)', async () => {
    const u = await makeUtilizador(prisma)
    expect(u.lastSeenAt).toBeNull()
    asUser(u.id)

    const before = Date.now()
    const res = await GET(new NextRequest('http://localhost/api/notificacoes?count=true'))
    const body = await res.json()

    // A contagem continua a ser devolvida normalmente.
    expect(res.status).toBe(200)
    expect(body).toHaveProperty('count')
    expect(typeof body.count).toBe('number')

    // E o heartbeat foi registado.
    const after = await prisma.utilizador.findUnique({ where: { id: u.id } })
    expect(after?.lastSeenAt).not.toBeNull()
    expect(after!.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(before - 1000)
  })

  test('sondagens seguidas dentro de 60s não regravam lastSeenAt (throttle)', async () => {
    const u = await makeUtilizador(prisma)
    asUser(u.id)

    await GET(new NextRequest('http://localhost/api/notificacoes?count=true'))
    const first = await prisma.utilizador.findUnique({ where: { id: u.id } })
    expect(first?.lastSeenAt).not.toBeNull()

    // Segunda sondagem imediata: dentro da janela de 60s → sem nova escrita.
    await GET(new NextRequest('http://localhost/api/notificacoes?count=true'))
    const second = await prisma.utilizador.findUnique({ where: { id: u.id } })
    expect(second!.lastSeenAt!.getTime()).toBe(first!.lastSeenAt!.getTime())
  })

  test('o caminho de lista (sem count) NÃO actualiza lastSeenAt', async () => {
    const u = await makeUtilizador(prisma)
    asUser(u.id)

    await GET(new NextRequest('http://localhost/api/notificacoes'))

    const after = await prisma.utilizador.findUnique({ where: { id: u.id } })
    expect(after?.lastSeenAt).toBeNull()
  })
})
