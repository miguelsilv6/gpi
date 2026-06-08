import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeUtilizador } from '../helpers/fixtures'
import { TipoNotificacao } from '@/generated/prisma/enums'

// O mailer é mockado — só queremos observar o efeito in-app/notificação.
vi.mock('@/lib/mailer', () => ({
  sendMail: vi.fn(async () => {}),
}))

import { notifyBugReportCriado, invalidatePolicyCache } from '@/lib/notifications'
import { isModuloBugReportsAtivo } from '@/lib/bugreports-module'

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
  for (const tipo of Object.values(TipoNotificacao)) {
    await prisma.notificationPolicy.create({
      data: {
        tipo,
        inAppEnabled: true,
        emailEnabled: true,
        // BUGREPORT_CRIADO dirige-se à administração (sem natural).
        ccRoles: tipo === 'BUGREPORT_CRIADO' ? ['ADMINISTRACAO'] : [],
      },
    })
  }
  invalidatePolicyCache()
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('notifyBugReportCriado', () => {
  test('notifica os administradores via ccRoles', async () => {
    const admin = await makeUtilizador(prisma, { role: 'ADMINISTRACAO' })
    await makeUtilizador(prisma, { role: 'INSPETOR' }) // não deve receber

    await notifyBugReportCriado({
      titulo: 'Botão não funciona',
      autorNome: 'Inspetor X',
      severidadeLabel: 'Alta',
    })

    const adminNotifs = await prisma.notificacao.findMany({
      where: { tipo: 'BUGREPORT_CRIADO' },
    })
    expect(adminNotifs).toHaveLength(1)
    expect(adminNotifs[0].utilizadorId).toBe(admin.id)
  })
})

describe('isModuloBugReportsAtivo', () => {
  test('ADMINISTRACAO tem sempre acesso, mesmo com o módulo desativado', async () => {
    await prisma.configuracaoSistema.create({
      data: { id: 'singleton', moduloBugReportsAtivo: false },
    })
    expect(await isModuloBugReportsAtivo('ADMINISTRACAO')).toBe(true)
  })

  test('default (sem config): role na lista padrão tem acesso', async () => {
    expect(await isModuloBugReportsAtivo('INSPETOR')).toBe(true)
  })

  test('módulo desativado bloqueia roles não-admin', async () => {
    await prisma.configuracaoSistema.create({
      data: { id: 'singleton', moduloBugReportsAtivo: false },
    })
    expect(await isModuloBugReportsAtivo('INSPETOR')).toBe(false)
  })

  test('role fora da lista de acesso é bloqueado', async () => {
    await prisma.configuracaoSistema.create({
      data: {
        id: 'singleton',
        moduloBugReportsAtivo: true,
        moduloBugReportsRoles: 'INSPETOR_CHEFE,COORDENADOR',
      },
    })
    expect(await isModuloBugReportsAtivo('INSPETOR')).toBe(false)
    expect(await isModuloBugReportsAtivo('INSPETOR_CHEFE')).toBe(true)
  })
})
