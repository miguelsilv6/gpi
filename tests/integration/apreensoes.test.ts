import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'
import { checkApreensoesParadas } from '@/lib/apreensoes'
import { invalidatePolicyCache } from '@/lib/notifications'
import { nuipcToSlug } from '@/lib/utils'
import { TipoNotificacao } from '@/generated/prisma/enums'
import { NextRequest } from 'next/server'

/**
 * Testes de integração do módulo Apreensões contra a BD real:
 *  - o motor do alerta "apreensão parada" (`checkApreensoesParadas`): dispara
 *    uma vez, marca o flag, é idempotente e respeita estado/config/soft-delete;
 *  - as rotas HTTP, com sessão mockada, focando o gate operacional (colaborador
 *    autorizado PODE registar, ao contrário dos intervenientes), o gate de
 *    módulo (503) e a proteção contra IDs cruzados.
 */

process.env.DISABLE_EMAIL = 'true'

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock('@/auth', () => ({ auth: authMock }))

import { POST, GET } from '@/app/api/inqueritos/[nuipc]/apreensoes/route'
import { PUT, DELETE } from '@/app/api/inqueritos/[nuipc]/apreensoes/[id]/route'

const prisma = getTestPrisma()

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
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

async function seedApreensao(
  inqId: string,
  registadoPorId: string,
  over: Partial<{ estado: string; dataApreensao: Date; alertaParadaEnviado: boolean; descricao: string }> = {},
) {
  return prisma.apreensao.create({
    data: {
      inqueritoid: inqId,
      registadoPorId,
      descricao: over.descricao ?? 'Objeto teste',
      tipo: 'OUTRO',
      dataApreensao: over.dataApreensao ?? daysAgo(200),
      estado: (over.estado as never) ?? 'EM_CUSTODIA',
      alertaParadaEnviado: over.alertaParadaEnviado ?? false,
    },
  })
}

beforeEach(async () => {
  await resetDatabase(prisma)
  // applyPolicy é fail-closed: semear todas as políticas com in-app ativo.
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

describe('checkApreensoesParadas', () => {
  test('alerta o inspetor e marca o flag quando o objeto está parado há mais do que o prazo', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const apr = await seedApreensao(s.inqA[0].id, s.inspetorA.id, { dataApreensao: daysAgo(200) })

    const { alertas } = await checkApreensoesParadas(new Date())
    expect(alertas).toBe(1)

    const notifs = await prisma.notificacao.findMany({
      where: { utilizadorId: s.inspetorA.id, tipo: 'APREENSAO_PARADA' },
    })
    expect(notifs).toHaveLength(1)

    const after = await prisma.apreensao.findUnique({ where: { id: apr.id } })
    expect(after?.alertaParadaEnviado).toBe(true)
  })

  test('é idempotente — não volta a alertar numa 2.ª corrida', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await seedApreensao(s.inqA[0].id, s.inspetorA.id, { dataApreensao: daysAgo(200) })

    await checkApreensoesParadas(new Date())
    const segunda = await checkApreensoesParadas(new Date())
    expect(segunda.alertas).toBe(0)

    const notifs = await prisma.notificacao.findMany({
      where: { utilizadorId: s.inspetorA.id, tipo: 'APREENSAO_PARADA' },
    })
    expect(notifs).toHaveLength(1)
  })

  test('não alerta objetos recentes (dentro do prazo)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await seedApreensao(s.inqA[0].id, s.inspetorA.id, { dataApreensao: daysAgo(30) })

    const { alertas } = await checkApreensoesParadas(new Date())
    expect(alertas).toBe(0)
  })

  test('não alerta objetos em estado terminal (já com destino dado)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await seedApreensao(s.inqA[0].id, s.inspetorA.id, {
      dataApreensao: daysAgo(300),
      estado: 'DEVOLVIDO',
    })

    const { alertas } = await checkApreensoesParadas(new Date())
    expect(alertas).toBe(0)
  })

  test('respeita o desligar do alerta (apreensaoAlertaDias = 0)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.configuracaoSistema.create({ data: { id: 'singleton', apreensaoAlertaDias: 0 } })
    await seedApreensao(s.inqA[0].id, s.inspetorA.id, { dataApreensao: daysAgo(500) })

    const { alertas } = await checkApreensoesParadas(new Date())
    expect(alertas).toBe(0)
  })

  test('respeita o desligar via campo vazio (apreensaoAlertaDias = null)', async () => {
    // Regressão: `config?.apreensaoAlertaDias ?? 180` reativava o alerta a 180
    // dias quando o utilizador limpava o campo (null) para o desligar.
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.configuracaoSistema.create({ data: { id: 'singleton', apreensaoAlertaDias: null } })
    await seedApreensao(s.inqA[0].id, s.inspetorA.id, { dataApreensao: daysAgo(500) })

    const { alertas } = await checkApreensoesParadas(new Date())
    expect(alertas).toBe(0)
  })

  test('ignora apreensões de inquéritos soft-deleted', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await seedApreensao(s.inqA[0].id, s.inspetorA.id, { dataApreensao: daysAgo(200) })
    await prisma.inquerito.update({ where: { id: s.inqA[0].id }, data: { deletedAt: new Date() } })

    const { alertas } = await checkApreensoesParadas(new Date())
    expect(alertas).toBe(0)
  })
})

describe('rotas de apreensões — gates', () => {
  test('titular regista (201) e o objeto fica no inquérito', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser(s.inspetorA)
    const res = await POST(
      jsonReq('POST', { descricao: 'Pistola', tipo: 'ARMA', dataApreensao: '2026-01-05' }),
      params(s.inqA[0].nuipc),
    )
    expect(res.status).toBe(201)
    const rows = await prisma.apreensao.findMany({ where: { inqueritoid: s.inqA[0].id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].descricao).toBe('Pistola')
  })

  test('colaborador autorizado PODE registar (gate operacional, 201)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    // inspetorB passa a colaborador de inqA[0] (titular inspetorA).
    await prisma.inqueritoColaborador.create({
      data: { inqueritoid: s.inqA[0].id, colaboradorId: s.inspetorB.id, concedidoPorId: s.inspetorA.id },
    })
    asUser(s.inspetorB)
    const res = await POST(
      jsonReq('POST', { descricao: 'Telemóvel', tipo: 'EQUIPAMENTO_INFORMATICO', dataApreensao: '2026-01-05' }),
      params(s.inqA[0].nuipc),
    )
    expect(res.status).toBe(201)
    expect(await prisma.apreensao.count()).toBe(1)
  })

  test('inspetor de outra brigada: 404 (nem sabe que existe)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser(s.inspetorB)
    const res = await POST(
      jsonReq('POST', { descricao: 'X', tipo: 'OUTRO', tipoOutro: 'Y', dataApreensao: '2026-01-05' }),
      params(s.inqA[0].nuipc),
    )
    expect(res.status).toBe(404)
    expect(await prisma.apreensao.count()).toBe(0)
  })

  test('tipo OUTRO sem descrição do tipo: 400', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    asUser(s.inspetorA)
    const res = await POST(
      jsonReq('POST', { descricao: 'X', tipo: 'OUTRO', dataApreensao: '2026-01-05' }),
      params(s.inqA[0].nuipc),
    )
    expect(res.status).toBe(400)
  })

  test('módulo desativado: 503', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.configuracaoSistema.create({
      data: { id: 'singleton', moduloApreensoesAtivo: false },
    })
    asUser(s.inspetorA)
    const res = await GET(jsonReq('GET'), params(s.inqA[0].nuipc))
    expect(res.status).toBe(503)
  })

  test('não autenticado: 401', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    authMock.mockResolvedValue(null)
    const res = await POST(
      jsonReq('POST', { descricao: 'X', tipo: 'ARMA', dataApreensao: '2026-01-05' }),
      params(s.inqA[0].nuipc),
    )
    expect(res.status).toBe(401)
    expect(await prisma.apreensao.count()).toBe(0)
  })

  test('PUT com o objeto de OUTRO inquérito no URL: 404 (cross-ID)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const apr = await seedApreensao(s.inqA[0].id, s.inspetorA.id)
    asUser(s.inspetorA)
    const res = await PUT(
      jsonReq('PUT', { descricao: 'Alterado', tipo: 'OUTRO', tipoOutro: 'Z', dataApreensao: '2026-01-05' }),
      paramsId(s.inqA[1].nuipc, apr.id),
    )
    expect(res.status).toBe(404)
    const after = await prisma.apreensao.findUnique({ where: { id: apr.id } })
    expect(after?.descricao).toBe('Objeto teste')
  })

  test('DELETE alheio dá 404; titular apaga (200)', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    const apr = await seedApreensao(s.inqA[0].id, s.inspetorA.id)

    asUser(s.inspetorB)
    const resAlheio = await DELETE(jsonReq('DELETE'), paramsId(s.inqA[0].nuipc, apr.id))
    expect(resAlheio.status).toBe(404)
    expect(await prisma.apreensao.count()).toBe(1)

    asUser(s.inspetorA)
    const resOk = await DELETE(jsonReq('DELETE'), paramsId(s.inqA[0].nuipc, apr.id))
    expect(resOk.status).toBe(200)
    expect(await prisma.apreensao.count()).toBe(0)
  })
})
