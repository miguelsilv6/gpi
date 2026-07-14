import { NextRequest } from 'next/server'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { resolveRp, buildRegistrationOptions, verifyRegistration } from '@/lib/webauthn'
import type { RegistrationResponseJSON } from '@simplewebauthn/types'

export const runtime = 'nodejs'

const CHALLENGE_COOKIE = 'wa_reg_chal'
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 300, // 5 min
}

async function rpFromRequest() {
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  return resolveRp(host, h.get('x-forwarded-proto'))
}

/** GET — opções de registo de uma nova passkey para o utilizador em sessão. */
export async function GET() {
  try {
    const session = await getSession()
    const [user, existing] = await Promise.all([
      prisma.utilizador.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, nome: true },
      }),
      prisma.webauthnCredential.findMany({
        where: { utilizadorId: session.user.id },
        select: { credentialId: true, publicKey: true, counter: true, transports: true },
      }),
    ])
    if (!user) return apiError('Utilizador não encontrado', 404)

    const rp = await rpFromRequest()
    const options = await buildRegistrationOptions({ user, existing, rp })
    ;(await cookies()).set(CHALLENGE_COOKIE, options.challenge, COOKIE_OPTS)
    return Response.json(options)
  } catch (error) {
    return handleApiError(error)
  }
}

const verifySchema = z.object({
  response: z.any(),
  nome: z.string().trim().max(60).optional(),
})

/** POST — verifica a resposta do registo e guarda a credencial. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const body = await req.json().catch(() => ({}))
    const parsed = verifySchema.safeParse(body)
    if (!parsed.success) return apiError('Pedido inválido', 400)

    const cookieStore = await cookies()
    const expectedChallenge = cookieStore.get(CHALLENGE_COOKIE)?.value
    if (!expectedChallenge) return apiError('Sessão de registo expirada. Tente novamente.', 400)

    const rp = await rpFromRequest()
    let credential
    try {
      credential = await verifyRegistration({
        response: parsed.data.response as RegistrationResponseJSON,
        expectedChallenge,
        rp,
      })
    } catch {
      credential = null
    }
    // Consome o challenge independentemente do resultado (uso único).
    cookieStore.delete(CHALLENGE_COOKIE)

    if (!credential) return apiError('Não foi possível verificar a passkey', 400)

    // credentialId é único global; se já existir, é conflito.
    const dup = await prisma.webauthnCredential.findUnique({
      where: { credentialId: credential.credentialId },
      select: { id: true },
    })
    if (dup) return apiError('Esta passkey já está registada', 409)

    const created = await prisma.webauthnCredential.create({
      data: {
        utilizadorId: session.user.id,
        credentialId: credential.credentialId,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports,
        deviceType: credential.deviceType,
        backedUp: credential.backedUp,
        nome: parsed.data.nome || null,
      },
      select: { id: true, nome: true, createdAt: true },
    })

    await writeAudit({
      req,
      utilizadorId: session.user.id,
      acao: 'CREATE_WEBAUTHN_CREDENTIAL',
      entidade: 'WebauthnCredential',
      entidadeId: created.id,
      detalhes: { nome: created.nome },
    }).catch(() => {})

    return Response.json({ ok: true, credential: created })
  } catch (error) {
    return handleApiError(error)
  }
}
