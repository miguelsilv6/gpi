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
    roles: ['INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO'],
  },
]

const isDev = process.env.NODE_ENV === 'development'

/**
 * Content-Security-Policy por pedido, baseada em nonce.
 *
 * - `script-src` deixa de usar `'unsafe-inline'`: passa a exigir um nonce por
 *   pedido + `'strict-dynamic'`. O Next.js lê a CSP do header do PEDIDO e aplica
 *   automaticamente o nonce aos seus próprios scripts; os scripts que estes
 *   carreguem (ex.: widget Turnstile, injetado via createElement) são confiados
 *   por `'strict-dynamic'`. O domínio Cloudflare fica na lista como fallback
 *   para browsers sem suporte a strict-dynamic (CSP2).
 * - `style-src` mantém `'unsafe-inline'`: muitas libs de UI (Recharts, Base UI)
 *   aplicam estilos inline sem nonce; bloqueá-los partiria a interface e o risco
 *   de XSS por estilo é muito inferior ao de script. `'unsafe-eval'` só em dev
 *   (HMR/React).
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src 'self' https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

export default auth((req) => {
  const { nextUrl } = req
  const session = req.auth

  // Nonce único por pedido. APIs edge-safe (crypto/btoa) para o Edge runtime.
  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce)

  // O Next.js extrai o nonce da CSP presente no header do PEDIDO e nonce-ia os
  // seus scripts; o x-nonce é lido pelo root layout (next-themes).
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp)

  function finalize(res: NextResponse): NextResponse {
    res.headers.set('content-security-policy', csp)
    return res
  }
  const allow = () => finalize(NextResponse.next({ request: { headers: requestHeaders } }))
  const redirect = (to: string) => finalize(NextResponse.redirect(new URL(to, nextUrl)))

  const path = nextUrl.pathname

  // Páginas públicas (sincronizar com authConfig.callbacks.authorized).
  if (path.startsWith('/password-reset')) return allow()
  if (path.startsWith('/login')) {
    return session?.user ? redirect('/dashboard') : allow()
  }

  if (!session?.user) {
    return redirect('/login')
  }

  // Fail-closed: se o role faltasse, includes() devolve false e o acesso a
  // rotas restritas é negado (em vez de permitido).
  const role = session.user.role as Role
  for (const { prefix, roles } of ROUTE_ROLE_REQUIREMENTS) {
    if (path.startsWith(prefix) && !roles.includes(role)) {
      return redirect('/dashboard?erro=sem-permissao')
    }
  }

  return allow()
})

export const config = {
  // Corre em todas as rotas HTML (inclui /login e /password-reset, para a CSP
  // com nonce as cobrir). Exclui APIs, assets estáticos e imagens.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
