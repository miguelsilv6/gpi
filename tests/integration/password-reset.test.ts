import { describe, test, expect, beforeEach, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { makeUtilizador } from '../helpers/fixtures'
import {
  requestPasswordReset,
  consumePasswordReset,
  hashToken,
  generateResetToken,
  cleanupExpiredResetTokens,
} from '@/lib/password-reset'

const prisma = getTestPrisma()

beforeEach(async () => {
  await resetDatabase(prisma)
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('generateResetToken', () => {
  test('gera token base64url + hash SHA-256', () => {
    const { token, tokenHash } = generateResetToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThan(40) // 32 bytes em base64url
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(hashToken(token)).toBe(tokenHash)
  })

  test('tokens são únicos com altíssima probabilidade', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateResetToken().token))
    expect(tokens.size).toBe(100)
  })
})

describe('requestPasswordReset', () => {
  test('cria token para utilizador activo', async () => {
    const user = await makeUtilizador(prisma, { email: 'a@test.local', ativo: true })
    const result = await requestPasswordReset('a@test.local')
    expect(result).not.toBeNull()
    expect(result!.utilizadorId).toBe(user.id)

    // O hash existe em DB; o token em claro não.
    const stored = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(result!.token) },
    })
    expect(stored).toBeTruthy()
    expect(stored?.usedAt).toBeNull()
  })

  test('devolve null para email desconhecido (sem deixar trail)', async () => {
    const result = await requestPasswordReset('ninguem@test.local')
    expect(result).toBeNull()
    const count = await prisma.passwordResetToken.count()
    expect(count).toBe(0)
  })

  test('devolve null para utilizador inactivo', async () => {
    await makeUtilizador(prisma, { email: 'inactive@test.local', ativo: false })
    const result = await requestPasswordReset('inactive@test.local')
    expect(result).toBeNull()
  })

  test('normaliza email (lowercase + trim)', async () => {
    const user = await makeUtilizador(prisma, { email: 'caps@test.local' })
    const result = await requestPasswordReset('  CAPS@TEST.LOCAL  ')
    expect(result?.utilizadorId).toBe(user.id)
  })
})

describe('consumePasswordReset (full flow)', () => {
  test('troca a password, bumpa tokenVersion, marca usedAt', async () => {
    const user = await makeUtilizador(prisma, { email: 'flow@test.local' })
    const versionBefore = user.tokenVersion

    const { token } = (await requestPasswordReset('flow@test.local'))!
    const result = await consumePasswordReset(token, 'novaPassword123!')

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const updated = await prisma.utilizador.findUnique({ where: { id: user.id } })
    expect(updated!.tokenVersion).toBe(versionBefore + 1)
    expect(updated!.failedLoginCount).toBe(0)
    expect(updated!.lockedUntil).toBeNull()

    // Verifica que a nova password é a que foi gravada.
    const matches = await bcrypt.compare('novaPassword123!', updated!.passwordHash)
    expect(matches).toBe(true)

    // Token marcado como usado.
    const stored = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    })
    expect(stored?.usedAt).not.toBeNull()
  })

  test('rejeita token já consumido (single-use)', async () => {
    await makeUtilizador(prisma, { email: 'single@test.local' })
    const { token } = (await requestPasswordReset('single@test.local'))!

    const first = await consumePasswordReset(token, 'newPass12345')
    expect(first.ok).toBe(true)

    const second = await consumePasswordReset(token, 'outroPass12345')
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.reason).toBe('used')
  })

  test('rejeita token expirado', async () => {
    const user = await makeUtilizador(prisma, { email: 'expired@test.local' })
    const { token, tokenHash } = generateResetToken()
    await prisma.passwordResetToken.create({
      data: {
        tokenHash,
        utilizadorId: user.id,
        expiresAt: new Date(Date.now() - 60_000), // 1 min no passado
      },
    })

    const result = await consumePasswordReset(token, 'tentativa12345')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('expired')
  })

  test('rejeita token desconhecido', async () => {
    const result = await consumePasswordReset('token-que-nao-existe-blah', 'pwd12345678')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid')
  })

  test('rejeita password fraca', async () => {
    await makeUtilizador(prisma, { email: 'weak@test.local' })
    const { token } = (await requestPasswordReset('weak@test.local'))!
    const result = await consumePasswordReset(token, '1234567') // <8 chars
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('weak_password')
  })
})

describe('cleanupExpiredResetTokens', () => {
  test('apaga tokens com expiresAt > 24h passada', async () => {
    const user = await makeUtilizador(prisma, { email: 'cleanup@test.local' })
    // Token expirado há 25h
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: 'a'.repeat(64),
        utilizadorId: user.id,
        expiresAt: new Date(Date.now() - 25 * 3600 * 1000),
      },
    })
    // Token expirado há 1h (ainda na janela de retenção)
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: 'b'.repeat(64),
        utilizadorId: user.id,
        expiresAt: new Date(Date.now() - 3600 * 1000),
      },
    })

    const removed = await cleanupExpiredResetTokens()
    expect(removed).toBe(1)
    const remaining = await prisma.passwordResetToken.count()
    expect(remaining).toBe(1)
  })
})
