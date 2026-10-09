import { describe, test, expect, afterAll, beforeEach, vi } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'

vi.mock('@/lib/mailer', () => ({
  sendMail: vi.fn(async () => {}),
}))
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock('@/auth', () => ({ auth: authMock }))

import { sendMail } from '@/lib/mailer'
import { runResumoDiario, formatResumoDiario } from '@/lib/resumo-diario'
import { getMeuDia } from '@/lib/meu-dia'
import { GET, PUT } from '@/app/api/notificacoes/preferencias/route'
import { NextRequest } from 'next/server'

/**
 * Resumo diário "O meu dia" por email: só para quem ativou, ignora inativos,
 * não envia resumos vazios e o corpo reflete os dados do dashboard.
 */

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
  vi.mocked(sendMail).mockClear()
})

afterAll(async () => {
  await disconnectTestPrisma()
})

function hojeAs(h: number): Date {
  const d = new Date()
  d.setHours(h, 0, 0, 0)
  return d
}

describe('runResumoDiario', () => {
  test('envia só a quem ativou e tem algo a assinalar', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.utilizador.updateMany({
      where: { id: { in: [s.inspetorA.id, s.inspetorB.id] } },
      data: { resumoDiarioEmail: true },
    })
    // Inspetor A tem uma diligência hoje; o B não tem nada.
    await prisma.diligencia.create({
      data: { titulo: 'Busca domiciliária', dataInicio: hojeAs(10), criadoPorId: s.inspetorA.id, inqueritoId: s.inqA[0].id },
    })
    // O chefe A tem tarefas mas não ativou o resumo.
    await prisma.tarefaInquerito.create({
      data: { titulo: 'Tarefa do chefe', autorId: s.chefeA.id, inqueritoId: s.inqA[0].id },
    })

    const r = await runResumoDiario()
    expect(r).toEqual({ enviados: 1, vazios: 1, falhas: 0 })
    expect(sendMail).toHaveBeenCalledTimes(1)
    const msg = vi.mocked(sendMail).mock.calls[0][0]
    expect(msg.to).toBe(s.inspetorA.email)
    expect(msg.subject).toContain('O meu dia')
    expect(msg.text).toContain('Busca domiciliária')
    expect(msg.html).toContain('Busca domiciliária')
  })

  test('utilizadores inativos não recebem', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.utilizador.update({
      where: { id: s.inspetorA.id },
      data: { resumoDiarioEmail: true, ativo: false },
    })
    await prisma.tarefaInquerito.create({
      data: { titulo: 'Pendente', autorId: s.inspetorA.id, inqueritoId: s.inqA[0].id },
    })
    expect((await runResumoDiario()).enviados).toBe(0)
    expect(sendMail).not.toHaveBeenCalled()
  })
})

describe('formatResumoDiario', () => {
  test('inclui atrasados, tarefas e ligação ao dashboard', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    await prisma.inquerito.update({ where: { id: s.inqA[0].id }, data: { dataPrazo: new Date('2020-01-01') } })
    await prisma.tarefaInquerito.create({
      data: { titulo: 'Pedir faturação', autorId: s.inspetorA.id, inqueritoId: s.inqA[0].id },
    })
    const dia = await getMeuDia('INSPETOR', s.inspetorA.id, s.brigadaA.id)
    const texto = formatResumoDiario(dia, 'https://gpi.exemplo.pt')
    expect(texto).toContain('1 prazo vencido')
    expect(texto).toContain('Tarefas em aberto (1)')
    expect(texto).toContain('Pedir faturação')
    expect(texto).toContain('https://gpi.exemplo.pt/dashboard')
    expect(texto).toContain('Hoje: sem eventos.')
  })
})

describe('/api/notificacoes/preferencias — opt-in do resumo diário', () => {
  test('GET devolve desligado por omissão; PUT liga e desliga', async () => {
    const s = await scenarioTwoBrigadas(prisma)
    authMock.mockResolvedValue({
      user: { id: s.inspetorA.id, role: 'INSPETOR', brigadaId: s.brigadaA.id, email: 'x@test.local', nome: 'X' },
    })
    const put = (body: unknown) =>
      PUT(new NextRequest('http://localhost/api', { method: 'PUT', body: JSON.stringify(body) }))

    expect((await (await GET()).json()).resumoDiario).toBe(false)
    expect((await put({ preferencias: [], resumoDiario: true })).status).toBe(200)
    expect((await (await GET()).json()).resumoDiario).toBe(true)
    // Guardar só as preferências por tipo não mexe no resumo.
    expect((await put({ preferencias: [] })).status).toBe(200)
    expect((await (await GET()).json()).resumoDiario).toBe(true)
    expect((await put({ preferencias: [], resumoDiario: false })).status).toBe(200)
    expect((await (await GET()).json()).resumoDiario).toBe(false)
  })
})
