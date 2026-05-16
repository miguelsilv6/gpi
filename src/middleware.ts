import NextAuth from 'next-auth'
import { authConfig } from '@/auth.config'
import { NextResponse } from 'next/server'
import type { Role } from '@/generated/prisma/enums'

const { auth } = NextAuth(authConfig)

const ROUTE_ROLE_REQUIREMENTS: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: '/utilizadores', roles: ['ADMINISTRACAO'] },
  { prefix: '/configuracoes', roles: ['ADMINISTRACAO'] },
  { prefix: '/brigadas', roles: ['COORDENADOR', 'ADMINISTRACAO'] },
  {
    prefix: '/estatisticas',
    roles: ['COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO'],
  },
]

export default auth((req) => {
  const { nextUrl } = req
  const session = req.auth

  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', nextUrl))
  }

  const role = session.user.role as Role

  for (const { prefix, roles } of ROUTE_ROLE_REQUIREMENTS) {
    if (nextUrl.pathname.startsWith(prefix)) {
      if (!roles.includes(role)) {
        return NextResponse.redirect(
          new URL('/dashboard?erro=sem-permissao', nextUrl),
        )
      }
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!api|login|_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
}
