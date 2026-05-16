import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { authConfig } from '@/auth.config'
import {
  LOGIN_MAX_FAILED_ATTEMPTS,
  LOGIN_LOCKOUT_MINUTES,
} from '@/lib/constants'

async function getClientHints() {
  try {
    const h = await headers()
    const xff = h.get('x-forwarded-for')
    const ip = xff ? xff.split(',')[0]!.trim() : (h.get('x-real-ip') ?? null)
    const userAgent = h.get('user-agent') ?? null
    return { ip, userAgent }
  } catch {
    return { ip: null, userAgent: null }
  }
}

async function recordAttempt(
  email: string,
  success: boolean,
  reason: string | null,
  ip: string | null,
  userAgent: string | null,
) {
  try {
    await prisma.loginAttempt.create({
      data: { email, success, reason, ip, userAgent },
    })
  } catch {
    // logging failure should never block auth
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // Initial sign-in: delegate to the shared callback for the field copy.
      if (user) {
        return authConfig.callbacks!.jwt!({ token, user, account: null }) as never
      }
      // Subsequent requests: re-validate the JWT against the live user record.
      // If the account was deactivated or tokenVersion bumped (password/role change),
      // wipe the token so the session is treated as logged-out.
      if (token.id) {
        try {
          const current = await prisma.utilizador.findUnique({
            where: { id: token.id as string },
            select: {
              ativo: true,
              tokenVersion: true,
              role: true,
              nome: true,
              brigadaId: true,
            },
          })
          if (!current || !current.ativo) return {}
          if ((current.tokenVersion ?? 0) !== (token.tokenVersion ?? 0)) return {}
          token.role = current.role
          token.nome = current.nome
          token.brigadaId = current.brigadaId
        } catch {
          // fail-open on transient DB errors — do not log everyone out
        }
      }
      return token
    },
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const rawEmail =
          typeof credentials?.email === 'string' ? credentials.email : ''
        const rawPassword =
          typeof credentials?.password === 'string' ? credentials.password : ''
        const email = rawEmail.toLowerCase().trim()

        const { ip, userAgent } = await getClientHints()

        if (!email || !rawPassword) {
          await recordAttempt(email || '(empty)', false, 'missing_credentials', ip, userAgent)
          return null
        }

        const utilizador = await prisma.utilizador.findUnique({
          where: { email },
        })

        if (!utilizador) {
          await recordAttempt(email, false, 'unknown_user', ip, userAgent)
          // constant-time dummy compare to mitigate user-enumeration timing
          await bcrypt.compare(rawPassword, '$2b$12$abcdefghijklmnopqrstuv')
          return null
        }

        if (!utilizador.ativo) {
          await recordAttempt(email, false, 'inactive', ip, userAgent)
          return null
        }

        if (utilizador.lockedUntil && utilizador.lockedUntil > new Date()) {
          await recordAttempt(email, false, 'locked', ip, userAgent)
          return null
        }

        const valid = await bcrypt.compare(rawPassword, utilizador.passwordHash)

        if (!valid) {
          const newFailed = utilizador.failedLoginCount + 1
          const lock =
            newFailed >= LOGIN_MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60_000)
              : null
          await prisma.utilizador.update({
            where: { id: utilizador.id },
            data: {
              failedLoginCount: newFailed,
              ...(lock && { lockedUntil: lock }),
            },
          })
          await recordAttempt(
            email,
            false,
            lock ? 'locked_after_failures' : 'bad_password',
            ip,
            userAgent,
          )
          return null
        }

        // Success — reset counters, stamp last login
        await prisma.utilizador.update({
          where: { id: utilizador.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
            lastLoginIp: ip,
          },
        })
        await recordAttempt(email, true, null, ip, userAgent)

        return {
          id: utilizador.id,
          nome: utilizador.nome,
          email: utilizador.email,
          role: utilizador.role,
          brigadaId: utilizador.brigadaId,
          tokenVersion: utilizador.tokenVersion,
        }
      },
    }),
  ],
})
