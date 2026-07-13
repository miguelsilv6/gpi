import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests do canal Web Push (`src/lib/push.ts`), com `web-push` e o Prisma
 * mockados. Cada teste re-importa o módulo (`vi.resetModules`) para reavaliar a
 * configuração VAPID a partir do env stubbado.
 */

const { findManyMock, deleteManyMock, sendNotificationMock, setVapidDetailsMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  deleteManyMock: vi.fn(),
  sendNotificationMock: vi.fn(),
  setVapidDetailsMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pushSubscription: { findMany: findManyMock, deleteMany: deleteManyMock },
  },
}))

vi.mock('web-push', () => ({
  default: { setVapidDetails: setVapidDetailsMock, sendNotification: sendNotificationMock },
}))

beforeEach(() => {
  vi.resetModules()
  findManyMock.mockReset()
  deleteManyMock.mockReset().mockResolvedValue({ count: 0 })
  sendNotificationMock.mockReset().mockResolvedValue(undefined)
  setVapidDetailsMock.mockReset()
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('push — sem VAPID configurado', () => {
  test('isPushConfigured() é false e sendPushToUser é no-op', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const mod = await import('@/lib/push')
    expect(mod.isPushConfigured()).toBe(false)
    expect(mod.getVapidPublicKey()).toBeNull()

    await mod.sendPushToUser('u1', { title: 't', body: 'b' })
    expect(findManyMock).not.toHaveBeenCalled()
    expect(sendNotificationMock).not.toHaveBeenCalled()
  })
})

describe('push — com VAPID configurado', () => {
  beforeEach(() => {
    vi.stubEnv('VAPID_PUBLIC_KEY', 'BPublicKeyForTests')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'privateKeyForTests')
    vi.stubEnv('VAPID_SUBJECT', 'mailto:a@b.pt')
  })

  test('isPushConfigured() true e expõe a chave pública', async () => {
    const mod = await import('@/lib/push')
    expect(mod.isPushConfigured()).toBe(true)
    expect(mod.getVapidPublicKey()).toBe('BPublicKeyForTests')
    expect(setVapidDetailsMock).toHaveBeenCalledTimes(1)
  })

  test('envia a todas as subscrições do utilizador', async () => {
    findManyMock.mockResolvedValue([
      { id: 's1', endpoint: 'https://push/1', p256dh: 'k1', auth: 'a1' },
      { id: 's2', endpoint: 'https://push/2', p256dh: 'k2', auth: 'a2' },
    ])
    const mod = await import('@/lib/push')
    await mod.sendPushToUser('u1', { title: 'Prazo', body: 'a terminar', url: '/x' })
    expect(sendNotificationMock).toHaveBeenCalledTimes(2)
    expect(deleteManyMock).not.toHaveBeenCalled()
  })

  test('subscrição expirada (410) é removida; as restantes mantêm-se', async () => {
    findManyMock.mockResolvedValue([
      { id: 's1', endpoint: 'https://push/1', p256dh: 'k1', auth: 'a1' },
      { id: 'sGone', endpoint: 'https://push/2', p256dh: 'k2', auth: 'a2' },
    ])
    sendNotificationMock.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === 'https://push/2') {
        const err = Object.assign(new Error('gone'), { statusCode: 410 })
        throw err
      }
    })
    const mod = await import('@/lib/push')
    await mod.sendPushToUser('u1', { title: 't', body: 'b' })
    expect(sendNotificationMock).toHaveBeenCalledTimes(2)
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { id: { in: ['sGone'] } } })
  })

  test('sem subscrições não chama web-push', async () => {
    findManyMock.mockResolvedValue([])
    const mod = await import('@/lib/push')
    await mod.sendPushToUser('u1', { title: 't', body: 'b' })
    expect(sendNotificationMock).not.toHaveBeenCalled()
  })
})
