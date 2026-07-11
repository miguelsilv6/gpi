import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError } from '@/lib/auth-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Marca a visita guiada como concluída/saltada para o utilizador atual, para
 * não voltar a arrancar automaticamente. Reativá-la (a partir do Perfil) não
 * precisa de repor este valor — a UI dispara a tour por evento.
 */
export async function POST(_req: NextRequest) {
  try {
    const session = await getSession()
    await prisma.utilizador.update({
      where: { id: session.user.id },
      data: { tourConcluidaEm: new Date() },
    })
    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
