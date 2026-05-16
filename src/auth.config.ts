import type { NextAuthConfig } from 'next-auth'
import type { Role } from '@/generated/prisma/enums'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      nome: string
      email: string
      role: Role
      brigadaId: string | null
    }
  }
  interface User {
    id?: string
    nome: string
    role: Role
    brigadaId: string | null
    tokenVersion?: number
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string
    nome?: string
    role?: string
    brigadaId?: string | null
    tokenVersion?: number
  }
}

export const authConfig: NextAuthConfig = {
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8h
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const isOnLogin = request.nextUrl.pathname.startsWith('/login')
      const isOnApi = request.nextUrl.pathname.startsWith('/api')

      if (isOnApi) return true
      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL('/dashboard', request.nextUrl))
        return true
      }
      return isLoggedIn
    },
    jwt({ token, user }) {
      // Initial sign-in: copy user fields onto the token.
      // (DB-backed validation lives in auth.ts so it stays out of the Edge runtime.)
      if (user) {
        token.id = user.id as string
        token.nome = user.nome
        token.role = user.role as string
        token.brigadaId = user.brigadaId as string | null
        token.tokenVersion = user.tokenVersion ?? 0
      }
      return token
    },
    session({ session, token }) {
      if (!token.id) {
        return { ...session, user: undefined as never }
      }
      session.user.id = token.id as string
      session.user.nome = token.nome as string
      session.user.role = token.role as Role
      session.user.brigadaId = token.brigadaId as string | null
      return session
    },
  },
}
