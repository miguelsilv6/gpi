import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'

export const runtime = 'nodejs'

/** GET — lista as passkeys do utilizador em sessão. */
export async function GET() {
  try {
    const session = await getSession()
    const credenciais = await prisma.webauthnCredential.findMany({
      where: { utilizadorId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nome: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        lastUsedAt: true,
      },
    })
    return Response.json({ credenciais })
  } catch (error) {
    return handleApiError(error)
  }
}

const deleteSchema = z.object({ id: z.string().min(1) })

/** DELETE — remove uma passkey do próprio utilizador. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    const body = await req.json().catch(() => ({}))
    const parsed = deleteSchema.safeParse(body)
    if (!parsed.success) return apiError('Pedido inválido', 400)

    // Só apaga se pertencer ao próprio utilizador.
    const result = await prisma.webauthnCredential.deleteMany({
      where: { id: parsed.data.id, utilizadorId: session.user.id },
    })
    if (result.count === 0) return apiError('Passkey não encontrada', 404)

    await writeAudit({
      req,
      utilizadorId: session.user.id,
      acao: 'DELETE_WEBAUTHN_CREDENTIAL',
      entidade: 'WebauthnCredential',
      entidadeId: parsed.data.id,
      detalhes: {},
    }).catch(() => {})

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
