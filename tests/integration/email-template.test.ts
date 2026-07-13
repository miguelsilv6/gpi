import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeUtilizador } from '../helpers/fixtures'
import { NextRequest } from 'next/server'

/**
 * Testes de integração do endpoint /api/email-template: gate de permissão
 * (só ADMINISTRACAO), persistência (Json na ConfiguracaoSistema) e validação.
 */

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock('@/auth', () => ({ auth: authMock }))

import { GET, PUT } from '@/app/api/email-template/route'

const prisma = getTestPrisma()

function asUser(u: { id: string; role: string }) {
  authMock.mockResolvedValue({
    user: { id: u.id, role: u.role, brigadaId: null, email: 'x@test.local', nome: 'X' },
  })
}

function putReq(body: unknown) {
  return new NextRequest('http://localhost/api/email-template', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validTemplate = {
  mostrarCabecalho: true,
  corDestaque: '#0a7d3b',
  saudacao: 'Bom dia,',
  rodape: 'Enviado por {appName}.',
  avisoLegal: 'Confidencial.',
  assuntoPrefixo: '[GPI]',
}

beforeEach(async () => {
  await resetDatabase(prisma)
  authMock.mockReset()
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('GET /api/email-template', () => {
  test('não-admin: 403', async () => {
    const insp = await makeUtilizador(prisma, { role: 'INSPETOR' })
    asUser(insp)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  test('admin sem template guardado: devolve os defaults', async () => {
    const admin = await makeUtilizador(prisma, { role: 'ADMINISTRACAO' })
    asUser(admin)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.template.mostrarCabecalho).toBe(true)
    expect(body.template.corDestaque).toBe('#1d4ed8')
    expect(body.defaults).toBeTruthy()
  })
})

describe('PUT /api/email-template', () => {
  test('não-admin: 403 e nada é gravado', async () => {
    const insp = await makeUtilizador(prisma, { role: 'INSPETOR' })
    asUser(insp)
    const res = await PUT(putReq(validTemplate))
    expect(res.status).toBe(403)
    const cfg = await prisma.configuracaoSistema.findUnique({ where: { id: 'singleton' } })
    expect(cfg?.emailTemplate ?? null).toBeNull()
  })

  test('admin grava e persiste; GET seguinte devolve o guardado', async () => {
    const admin = await makeUtilizador(prisma, { role: 'ADMINISTRACAO' })
    asUser(admin)
    const res = await PUT(putReq(validTemplate))
    expect(res.status).toBe(200)

    const cfg = await prisma.configuracaoSistema.findUnique({ where: { id: 'singleton' } })
    expect((cfg?.emailTemplate as { corDestaque: string }).corDestaque).toBe('#0a7d3b')

    const getRes = await GET()
    const body = await getRes.json()
    expect(body.template.saudacao).toBe('Bom dia,')
    expect(body.template.assuntoPrefixo).toBe('[GPI]')
  })

  test('regista auditoria UPDATE_EMAIL_TEMPLATE', async () => {
    const admin = await makeUtilizador(prisma, { role: 'ADMINISTRACAO' })
    asUser(admin)
    await PUT(putReq(validTemplate))
    const logs = await prisma.auditLog.findMany({ where: { acao: 'UPDATE_EMAIL_TEMPLATE' } })
    expect(logs).toHaveLength(1)
  })

  test('cor inválida: 400', async () => {
    const admin = await makeUtilizador(prisma, { role: 'ADMINISTRACAO' })
    asUser(admin)
    const res = await PUT(putReq({ ...validTemplate, corDestaque: 'vermelho' }))
    expect(res.status).toBe(400)
  })

  test('campo em falta: 400', async () => {
    const admin = await makeUtilizador(prisma, { role: 'ADMINISTRACAO' })
    asUser(admin)
    const { saudacao, ...semSaudacao } = validTemplate
    void saudacao
    const res = await PUT(putReq(semSaudacao))
    expect(res.status).toBe(400)
  })
})
