import { describe, test, expect, beforeEach } from 'vitest'
import {
  checkRateLimit,
  enforceRateLimit,
  resetRateLimit,
  _resetAllForTests,
  clientFingerprint,
} from '@/lib/rate-limit'

beforeEach(() => {
  _resetAllForTests()
})

describe('checkRateLimit (sliding window)', () => {
  test('admite até max pedidos na janela', () => {
    const config = { key: 'test:a', max: 3, windowMs: 1000 }
    expect(checkRateLimit(config).allowed).toBe(true)
    expect(checkRateLimit(config).allowed).toBe(true)
    expect(checkRateLimit(config).allowed).toBe(true)
    // 4º pedido: bloqueado
    const r = checkRateLimit(config)
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
    expect(r.retryAfterMs).toBeGreaterThan(0)
  })

  test('remaining decresce com cada hit admitido', () => {
    const config = { key: 'test:b', max: 5, windowMs: 1000 }
    expect(checkRateLimit(config).remaining).toBe(4)
    expect(checkRateLimit(config).remaining).toBe(3)
    expect(checkRateLimit(config).remaining).toBe(2)
  })

  test('hits expirados saem da janela (sliding)', async () => {
    const config = { key: 'test:c', max: 2, windowMs: 100 }
    checkRateLimit(config) // hit 1
    checkRateLimit(config) // hit 2
    expect(checkRateLimit(config).allowed).toBe(false) // bloqueado

    // Esperar janela inteira
    await new Promise((r) => setTimeout(r, 150))

    expect(checkRateLimit(config).allowed).toBe(true) // novo hit OK
  })

  test('chaves separadas têm buckets isolados', () => {
    checkRateLimit({ key: 'k1', max: 1, windowMs: 1000 })
    expect(checkRateLimit({ key: 'k2', max: 1, windowMs: 1000 }).allowed).toBe(true)
    // K1 já esgotou; k2 ainda não
    expect(checkRateLimit({ key: 'k1', max: 1, windowMs: 1000 }).allowed).toBe(false)
  })

  test('pedidos rejeitados NÃO estendem a janela', () => {
    const config = { key: 'test:d', max: 1, windowMs: 1000 }
    checkRateLimit(config) // hit 1 — bucket = [t0]
    const blocked1 = checkRateLimit(config) // bloqueado
    expect(blocked1.allowed).toBe(false)
    const r1 = blocked1.retryAfterMs
    const blocked2 = checkRateLimit(config) // continua bloqueado
    const r2 = blocked2.retryAfterMs
    // O retryAfter do segundo NÃO deve ter aumentado — bucket não cresceu.
    expect(r2).toBeLessThanOrEqual(r1)
  })
})

describe('enforceRateLimit (wrapper para route handlers)', () => {
  test('devolve null quando admite', () => {
    const result = enforceRateLimit({ key: 'e:a', max: 5, windowMs: 1000 })
    expect(result).toBeNull()
  })

  test('devolve Response 429 quando bloqueia, com Retry-After header', async () => {
    const config = { key: 'e:b', max: 1, windowMs: 1000 }
    enforceRateLimit(config)
    const blocked = enforceRateLimit(config)
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(429)
    expect(blocked!.headers.get('Retry-After')).toBeTruthy()
    const body = await blocked!.json()
    expect(body.error).toMatch(/Demasiados/)
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(0)
  })
})

describe('resetRateLimit', () => {
  test('limpa o bucket de uma chave', () => {
    const config = { key: 'r:a', max: 1, windowMs: 1000 }
    checkRateLimit(config)
    expect(checkRateLimit(config).allowed).toBe(false)
    resetRateLimit('r:a')
    expect(checkRateLimit(config).allowed).toBe(true)
  })
})

describe('clientFingerprint', () => {
  test('extrai o primeiro IP de x-forwarded-for', () => {
    const req = new Request('http://example/', {
      headers: { 'x-forwarded-for': '203.0.113.5, 198.51.100.7' },
    })
    expect(clientFingerprint(req)).toBe('203.0.113.5')
  })

  test('cai em x-real-ip quando não há xff', () => {
    const req = new Request('http://example/', {
      headers: { 'x-real-ip': '10.0.0.5' },
    })
    expect(clientFingerprint(req)).toBe('10.0.0.5')
  })

  test('devolve "unknown" quando não há headers', () => {
    const req = new Request('http://example/')
    expect(clientFingerprint(req)).toBe('unknown')
  })
})
