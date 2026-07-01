import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { checkPermission, handleApiError, apiError } from '@/lib/auth-helpers'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import { findConexoes } from '@/lib/conexoes'
import { slugToNuipc } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

const querySchema = z.object({
  nif: z.string().max(40).optional(),
  contacto: z.string().max(60).optional(),
  email: z.string().max(200).optional(),
  /** Slug do inquérito a excluir (modo edição — o próprio). */
  excludeNuipc: z.string().max(100).optional(),
})

/**
 * GET /api/inqueritos/conexoes?nif=…&contacto=…&email=…
 *
 * Possíveis conexões pelo denunciante — usado pelo aviso do formulário de
 * criação/edição. Devolve apenas inquéritos dentro do âmbito do utilizador
 * (mesma regra de leitura de sempre); o matching é tolerante a formatação
 * (ver src/lib/conexoes.ts).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await checkPermission('inquerito:read:own')
    const role = session.user.role as Role

    const limited = enforceRateLimit({
      key: `inqueritos:conexoes:${clientFingerprint(req)}:${session.user.id}`,
      max: 30,
      windowMs: 60_000,
    })
    if (limited) return limited

    const { searchParams } = req.nextUrl
    const parsed = querySchema.safeParse({
      nif: searchParams.get('nif') ?? undefined,
      contacto: searchParams.get('contacto') ?? undefined,
      email: searchParams.get('email') ?? undefined,
      excludeNuipc: searchParams.get('excludeNuipc') ?? undefined,
    })
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    let excludeId: string | null = null
    if (parsed.data.excludeNuipc) {
      const self = await prisma.inquerito.findFirst({
        where: { nuipc: slugToNuipc(parsed.data.excludeNuipc) },
        select: { id: true },
      })
      excludeId = self?.id ?? null
    }

    const items = await findConexoes(
      { nif: parsed.data.nif, contacto: parsed.data.contacto, email: parsed.data.email },
      excludeId,
      role,
      session.user.id,
      session.user.brigadaId ?? null,
    )

    return Response.json({ items })
  } catch (error) {
    return handleApiError(error)
  }
}
