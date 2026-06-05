import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeUtilizador } from '../helpers/fixtures'
import { TipoNotificacao } from '@/generated/prisma/enums'

// Mock do mailer — queremos observar SE o email é (ou não) enviado, sem
// depender de um SMTP real. O in-app é verificado via linhas em Notificacao.
vi.mock('@/lib/mailer', () => ({
  sendMail: vi.fn(async () => {}),
}))

import { applyPolicy, invalidatePolicyCache } from '@/lib/notifications'
import { sendMail } from '@/lib/mailer'

const prisma = getTestPrisma()
const sendMailMock = vi.mocked(sendMail)

beforeEach(async () => {
  await resetDatabase(prisma)
  for (const tipo of Object.values(TipoNotificacao)) {
    await prisma.notificationPolicy.create({
      data: { tipo, inAppEnabled: true, emailEnabled: true, ccRoles: [] },
    })
  }
  invalidatePolicyCache()
  sendMailMock.mockClear()
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('preferências de email por utilizador', () => {
  test('opt-out: não envia email mas mantém o in-app', async () => {
    const inspetor = await makeUtilizador(prisma, { role: 'INSPETOR' })
    await prisma.notificacaoPreferencia.create({
      data: { utilizadorId: inspetor.id, tipo: 'INQUERITO_ATRIBUIDO', emailEnabled: false },
    })

    await applyPolicy({
      tipo: 'INQUERITO_ATRIBUIDO',
      titulo: 'Teste',
      mensagem: 'Mensagem',
      naturalUserId: inspetor.id,
    })

    // In-app continua a ser criado.
    const notifs = await prisma.notificacao.findMany({ where: { utilizadorId: inspetor.id } })
    expect(notifs).toHaveLength(1)
    // Email NÃO foi enviado.
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  test('sem preferência (default on): envia email', async () => {
    const inspetor = await makeUtilizador(prisma, { role: 'INSPETOR' })

    await applyPolicy({
      tipo: 'INQUERITO_ATRIBUIDO',
      titulo: 'Teste',
      mensagem: 'Mensagem',
      naturalUserId: inspetor.id,
    })

    expect(sendMailMock).toHaveBeenCalledTimes(1)
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: inspetor.email }))
  })

  test('opt-out só afeta o tipo escolhido', async () => {
    const inspetor = await makeUtilizador(prisma, { role: 'INSPETOR' })
    await prisma.notificacaoPreferencia.create({
      data: { utilizadorId: inspetor.id, tipo: 'INQUERITO_ATRIBUIDO', emailEnabled: false },
    })

    await applyPolicy({
      tipo: 'PRAZO_APROXIMANDO',
      titulo: 'Teste',
      mensagem: 'Mensagem',
      naturalUserId: inspetor.id,
    })

    // Tipo diferente do opt-out → email enviado normalmente.
    expect(sendMailMock).toHaveBeenCalledTimes(1)
  })
})
