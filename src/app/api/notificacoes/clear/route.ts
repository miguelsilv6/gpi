import { prisma } from '@/lib/prisma'
import { getSession, handleApiError } from '@/lib/auth-helpers'

export async function POST() {
  try {
    const session = await getSession()
    await prisma.notificacao.updateMany({
      where: { utilizadorId: session.user.id, limpa: false },
      data: { limpa: true, lida: true },
    })
    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
