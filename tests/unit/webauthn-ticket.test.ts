import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * O bilhete WebAuthn é a ponte entre a verificação da asserção (rota) e a
 * criação da sessão (Auth.js). É segurança-crítico: só deve ser aceite se a
 * assinatura HMAC bater certo e ainda não tiver expirado.
 */

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('AUTH_SECRET', 'test-secret-abc')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('bilhete WebAuthn', () => {
  test('round-trip válido devolve o userId', async () => {
    const { mintWebauthnTicket, verifyWebauthnTicket } = await import('@/lib/webauthn-ticket')
    const ticket = mintWebauthnTicket('user-1', 60)
    expect(verifyWebauthnTicket(ticket)).toBe('user-1')
  })

  test('bilhete expirado é rejeitado', async () => {
    const { mintWebauthnTicket, verifyWebauthnTicket } = await import('@/lib/webauthn-ticket')
    const ticket = mintWebauthnTicket('user-1', -1) // já expirado
    expect(verifyWebauthnTicket(ticket)).toBeNull()
  })

  test('assinatura adulterada é rejeitada', async () => {
    const { mintWebauthnTicket, verifyWebauthnTicket } = await import('@/lib/webauthn-ticket')
    const ticket = mintWebauthnTicket('user-1', 60)
    const tampered = ticket.slice(0, -2) + (ticket.endsWith('a') ? 'b' : 'a')
    expect(verifyWebauthnTicket(tampered)).toBeNull()
  })

  test('userId forjado (payload trocado) invalida a assinatura', async () => {
    const { mintWebauthnTicket, verifyWebauthnTicket } = await import('@/lib/webauthn-ticket')
    const parts = mintWebauthnTicket('user-1', 60).split('.')
    const forged = ['user-2', parts[1], parts[2]].join('.')
    expect(verifyWebauthnTicket(forged)).toBeNull()
  })

  test('formatos inválidos são rejeitados', async () => {
    const { verifyWebauthnTicket } = await import('@/lib/webauthn-ticket')
    expect(verifyWebauthnTicket('garbage')).toBeNull()
    expect(verifyWebauthnTicket('')).toBeNull()
    expect(verifyWebauthnTicket('a.b')).toBeNull()
  })

  test('sem AUTH_SECRET não valida nada', async () => {
    vi.stubEnv('AUTH_SECRET', '')
    vi.stubEnv('NEXTAUTH_SECRET', '')
    const { verifyWebauthnTicket } = await import('@/lib/webauthn-ticket')
    expect(verifyWebauthnTicket('user-1.9999999999.sig')).toBeNull()
  })
})

describe('resolveRp', () => {
  test('usa env quando presente', async () => {
    vi.stubEnv('WEBAUTHN_RP_ID', 'gpi.example.pt')
    vi.stubEnv('WEBAUTHN_ORIGIN', 'https://gpi.example.pt')
    const { resolveRp } = await import('@/lib/webauthn')
    const rp = resolveRp('whatever:3000', 'http')
    expect(rp.rpID).toBe('gpi.example.pt')
    expect(rp.origin).toBe('https://gpi.example.pt')
  })

  test('deriva do host quando env ausente (rpID sem porta)', async () => {
    const { resolveRp } = await import('@/lib/webauthn')
    const rp = resolveRp('localhost:3100', 'http')
    expect(rp.rpID).toBe('localhost')
    expect(rp.origin).toBe('http://localhost:3100')
  })
})
