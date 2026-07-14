import { NextRequest } from 'next/server'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { handleApiError, apiError } from '@/lib/auth-helpers'
import { resolveRp, buildAuthenticationOptions, verifyAuthentication } from '@/lib/webauthn'
import { mintWebauthnTicket } from '@/lib/webauthn-ticket'
import type { AuthenticationResponseJSON } from '@simplewebauthn/types'

export const runtime = 'nodejs'

const CHALLENGE_COOKIE = 'wa_auth_chal'
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 300,
}

async function rpFromRequest() {
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  return resolveRp(host, h.get('x-forwarded-proto'))
}

/** GET — opções de autenticação (login sem nome de utilizador). */
export async function GET() {
  try {
    const rp = await rpFromRequest()
    const options = await buildAuthenticationOptions(rp)
    ;(await cookies()).set(CHALLENGE_COOKIE, options.challenge, COOKIE_OPTS)
    return Response.json(options)
  } catch (error) {
    return handleApiError(error)
  }
}

const verifySchema = z.object({ response: z.any() })

/**
 * POST — verifica a asserção e, em caso de sucesso, emite um bilhete de uso
 * único que o cliente entrega ao `signIn('passkey')` para estabelecer a sessão.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const parsed = verifySchema.safeParse(body)
    if (!parsed.success) return apiError('Pedido inválido', 400)
    const response = parsed.data.response as AuthenticationResponseJSON

    const cookieStore = await cookies()
    const expectedChallenge = cookieStore.get(CHALLENGE_COOKIE)?.value
    if (!expectedChallenge) return apiError('Sessão de autenticação expirada.', 400)
    // Consome o challenge de imediato (uso único), aconteça o que acontecer.
    cookieStore.delete(CHALLENGE_COOKIE)

    if (typeof response?.id !== 'string') return apiError('Asserção inválida', 400)

    const credential = await prisma.webauthnCredential.findUnique({
      where: { credentialId: response.id },
      select: {
        id: true,
        credentialId: true,
        publicKey: true,
        counter: true,
        transports: true,
        utilizador: { select: { id: true, ativo: true } },
      },
    })
    // Erro genérico — não revela se a credencial existe.
    if (!credential || !credential.utilizador.ativo) {
      return apiError('Não foi possível autenticar com esta passkey', 401)
    }

    const rp = await rpFromRequest()
    let result
    try {
      result = await verifyAuthentication({
        response,
        expectedChallenge,
        rp,
        stored: {
          credentialId: credential.credentialId,
          publicKey: credential.publicKey,
          counter: credential.counter,
          transports: credential.transports,
        },
      })
    } catch {
      result = null
    }
    if (!result) return apiError('Não foi possível autenticar com esta passkey', 401)

    await prisma.webauthnCredential.update({
      where: { id: credential.id },
      data: { counter: result.newCounter, lastUsedAt: new Date() },
    })

    const ticket = mintWebauthnTicket(credential.utilizador.id)
    return Response.json({ ticket })
  } catch (error) {
    return handleApiError(error)
  }
}
