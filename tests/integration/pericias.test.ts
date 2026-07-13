import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { checkPericiasAtrasadas } from '@/lib/pericias'
import { invalidatePolicyCache } from '@/lib/notifications'
import { nuipcToSlug } from '@/lib/utils'
import { TipoNotificacao } from '@/generated/prisma/enums'
import { NextRequest } from 'next/server'

/**
 * Testes de integração do módulo Perícias:
 *  - o motor do alerta "perícia atrasada" (`checkPericiasAtrasadas`);
 *  - as rotas HTTP (gate operacional, módulo, cross-ID) e a validação da
 *    ligação opcional ao objeto apreendido (tem de ser do mesmo inquérito).
 */

process.env.DISABLE_EMAIL = 'true'

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock('@/auth', () => ({ auth: authMock }))

import { POST, GET } from '@/app/api/inqueritos/[nuipc]/pericias/route'
import { PUT, DELETE } from '@/app/api/inqueritos/[nuipc]/pericias/[id]/route'

const prisma = getTestPrisma()

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}
function daysFromNow(days: number): Date {
  return daysAgo(-days)
}

function asUser(u: { id: string; role: string; brigadaId: string | null }) {
  authMock.mockResolvedValue({
    user: { id: u.id, role: u.role, brigadaId: u.brigadaId, email: 'x@test.local', nome: 'X' },
  })
}

function jsonReq(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api', {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

const params = (nuipc: string) => ({ params: Promise.resolve({ nuipc: nuipcToSlug(nuipc) }) })
const paramsId = (nuipc: string, id: string) => ({
  params: Promise.resolve({ nuipc: nuipcToSlug(nuipc), id }),
})

async function seedPericia(
  inqId: string,
  registadoPorId: string,
  over: Partial<{ estado: string; dataPrevista: Date | null; alertaAtrasoEnviado: boolean }> = {},
) {
  return prisma.pericia.create({
    data: {
      inqueritoid: inqId,
      registadoPorId,
      tipo: 'BALISTICA',
      descricao: 'Exame teste',
      dataPedido: daysAgo(30),
      dataPrevista: over.dataPrevista === undefined ? daysAgo(5) : over.dataPrevista,
      estado: (over.estado as never) ?? 'SOLICITADA',
      alertaAtrasoEnviado: over.alertaAtrasoEnviado ?? false,
    },
  })
}

beforeEach(async () => {
  await resetDatabase(prisma)
  for (const tipo of Object.values(TipoNotificacao)) {
    await prisma.notificationPolicy.create({
      data: { tipo, inAppEnabled: true, emailEnabled: false, ccRoles: [] },
    })
  }
  invalidatePolicyCache()
  authMock.mockReset()
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('checkPericiasAtrasadas', () => {
  test('alerta o inspetor e marca o flag quando a data prevista passou', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const p = await seedPericia(s.inqA[0].id, s.inspetorA.id, { dataPrevista: daysAgo(5) })

    const { alertas } = await checkPericiasAtrasadas(new Date())
    expect(alertas).toBe(1)

    const notifs = await prisma.notificacao.findMany({
      where: { utilizadorId: s.inspetorA.id, tipo: 'PERICIA_ATRASADA' },
    })
    expect(notifs).toHaveLength(1)

    const after = await prisma.pericia.findUnique({ where: { id: p.id } })
    expect(after?.alertaAtrasoEnviado).toBe(true)
  })

  test('é idempotente — não volta a alertar numa 2.ª corrida', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await seedPericia(s.inqA[0].id, s.inspetorA.id, { dataPrevista: daysAgo(5) })

    await checkPericiasAtrasadas(new Date())
    const segunda = await checkPericiasAtrasadas(new Date())
    expect(segunda.alertas).toBe(0)

    const notifs = await prisma.notificacao.findMany({ where: { tipo: 'PERICIA_ATRASADA' } })
    expect(notifs).toHaveLength(1)
  })

  test('não alerta quando a data prevista ainda não passou', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await seedPericia(s.inqA[0].id, s.inspetorA.id, { dataPrevista: daysFromNow(10) })

    const { alertas } = await checkPericiasAtrasadas(new Date())
    expect(alertas).toBe(0)
  })

  test('não alerta perícias já concluídas/canceladas', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await seedPericia(s.inqA[0].id, s.inspetorA.id, { estado: 'CONCLUIDA', dataPrevista: daysAgo(20) })

    const { alertas } = await checkPericiasAtrasadas(new Date())
    expect(alertas).toBe(0)
  })

  test('não alerta perícias sem data prevista', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await seedPericia(s.inqA[0].id, s.inspetorA.id, { dataPrevista: null })

    const { alertas } = await checkPericiasAtrasadas(new Date())
    expect(alertas).toBe(0)
  })

  test('ignora perícias de inquéritos soft-deleted', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await seedPericia(s.inqA[0].id, s.inspetorA.id, { dataPrevista: daysAgo(5) })
    await prisma.inquerito.update({ where: { id: s.inqA[0].id }, data: { deletedAt: new Date() } })

    const { alertas } = await checkPericiasAtrasadas(new Date())
    expect(alertas).toBe(0)
  })
})

describe('rotas de perícias — gates e ligação à apreensão', () => {
  const novaPericia = (over: Record<string, unknown> = {}) => ({
    tipo: 'ADN',
    descricao: 'Comparação genética',
    dataPedido: '2026-01-05',
    ...over,
  })

  test('titular regista (201) e a perícia fica no inquérito', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser(s.inspetorA)
    const res = await POST(jsonReq('POST', novaPericia()), params(s.inqA[0].nuipc))
    expect(res.status).toBe(201)
    const rows = await prisma.pericia.findMany({ where: { inqueritoid: s.inqA[0].id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].descricao).toBe('Comparação genética')
  })

  test('colaborador autorizado PODE registar (gate operacional, 201)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.inqueritoColaborador.create({
      data: { inqueritoid: s.inqA[0].id, colaboradorId: s.inspetorB.id, concedidoPorId: s.inspetorA.id },
    })
    asUser(s.inspetorB)
    const res = await POST(jsonReq('POST', novaPericia()), params(s.inqA[0].nuipc))
    expect(res.status).toBe(201)
    expect(await prisma.pericia.count()).toBe(1)
  })

  test('inspetor de outra brigada: 404', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser(s.inspetorB)
    const res = await POST(jsonReq('POST', novaPericia()), params(s.inqA[0].nuipc))
    expect(res.status).toBe(404)
    expect(await prisma.pericia.count()).toBe(0)
  })

  test('módulo desativado: 503', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.configuracaoSistema.create({ data: { id: 'singleton', moduloPericiasAtivo: false } })
    asUser(s.inspetorA)
    const res = await GET(jsonReq('GET'), params(s.inqA[0].nuipc))
    expect(res.status).toBe(503)
  })

  test('liga a uma apreensão do MESMO inquérito (201)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const apr = await prisma.apreensao.create({
      data: {
        inqueritoid: s.inqA[0].id,
        registadoPorId: s.inspetorA.id,
        descricao: 'Arma apreendida',
        tipo: 'ARMA',
        dataApreensao: daysAgo(40),
      },
    })
    asUser(s.inspetorA)
    const res = await POST(jsonReq('POST', novaPericia({ apreensaoId: apr.id })), params(s.inqA[0].nuipc))
    expect(res.status).toBe(201)
    const p = await prisma.pericia.findFirst({ where: { inqueritoid: s.inqA[0].id } })
    expect(p?.apreensaoId).toBe(apr.id)
  })

  test('rejeita apreensão de OUTRO inquérito (400)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    // Apreensão no inqA[1], perícia no inqA[0] → não deve ligar.
    const aprAlheia = await prisma.apreensao.create({
      data: {
        inqueritoid: s.inqA[1].id,
        registadoPorId: s.inspetorA.id,
        descricao: 'Objeto de outro inquérito',
        tipo: 'OUTRO',
        dataApreensao: daysAgo(40),
      },
    })
    asUser(s.inspetorA)
    const res = await POST(jsonReq('POST', novaPericia({ apreensaoId: aprAlheia.id })), params(s.inqA[0].nuipc))
    expect(res.status).toBe(400)
    expect(await prisma.pericia.count()).toBe(0)
  })

  test('PUT com a perícia de OUTRO inquérito no URL: 404 (cross-ID)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const p = await seedPericia(s.inqA[0].id, s.inspetorA.id)
    asUser(s.inspetorA)
    const res = await PUT(
      jsonReq('PUT', novaPericia({ descricao: 'Alterada' })),
      paramsId(s.inqA[1].nuipc, p.id),
    )
    expect(res.status).toBe(404)
    const after = await prisma.pericia.findUnique({ where: { id: p.id } })
    expect(after?.descricao).toBe('Exame teste')
  })

  test('DELETE alheio dá 404; titular apaga (200)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const p = await seedPericia(s.inqA[0].id, s.inspetorA.id)

    asUser(s.inspetorB)
    const resAlheio = await DELETE(jsonReq('DELETE'), paramsId(s.inqA[0].nuipc, p.id))
    expect(resAlheio.status).toBe(404)
    expect(await prisma.pericia.count()).toBe(1)

    asUser(s.inspetorA)
    const resOk = await DELETE(jsonReq('DELETE'), paramsId(s.inqA[0].nuipc, p.id))
    expect(resOk.status).toBe(200)
    expect(await prisma.pericia.count()).toBe(0)
  })
})
