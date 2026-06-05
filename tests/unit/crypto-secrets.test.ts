import { describe, test, expect } from 'vitest'
import { encryptSecret, decryptSecret } from '@/lib/crypto-secrets'

// NEXTAUTH_SECRET é definido em tests/setup.ts, pelo que getKey() funciona.

describe('crypto-secrets', () => {
  test('round-trip encrypt/decrypt devolve o texto original', () => {
    const plain = 'super-secret-smtp-password-123!'
    const enc = encryptSecret(plain)
    expect(enc).not.toBe(plain)
    expect(enc.startsWith('v1:')).toBe(true)
    expect(decryptSecret(enc)).toBe(plain)
  })

  test('cada cifra usa um IV diferente (ciphertexts distintos)', () => {
    const a = encryptSecret('mesmo-valor')
    const b = encryptSecret('mesmo-valor')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('mesmo-valor')
    expect(decryptSecret(b)).toBe('mesmo-valor')
  })

  test('suporta strings vazias e unicode', () => {
    expect(decryptSecret(encryptSecret(''))).toBe('')
    const u = 'pâsswörd—çãô🔐'
    expect(decryptSecret(encryptSecret(u))).toBe(u)
  })

  test('decryptSecret lança em ciphertext adulterado', () => {
    const enc = encryptSecret('intacto')
    const parts = enc.split(':')
    // Corromper o último byte do ciphertext.
    const ct = Buffer.from(parts[3]!, 'base64')
    ct[ct.length - 1] ^= 0xff
    parts[3] = ct.toString('base64')
    expect(() => decryptSecret(parts.join(':'))).toThrow()
  })

  test('decryptSecret lança em formato inválido', () => {
    expect(() => decryptSecret('não-é-um-segredo')).toThrow('Formato de segredo cifrado inválido.')
    expect(() => decryptSecret('v2:a:b:c')).toThrow('Formato de segredo cifrado inválido.')
  })
})
