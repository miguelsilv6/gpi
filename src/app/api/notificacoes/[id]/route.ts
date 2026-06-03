import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'

// PATCH /api/notificacoes/:id — mark as read or clear (action=clear)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession()
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    const notif = await prisma.notificacao.findFirst({
      where: { id, utilizadorId: session.user.id },
    })
    if (!notif) return apiError('Não encontrada', 404)

    if (action === 'clear') {
      await prisma.notificacao.update({ where: { id }, data: { limpa: true, lida: true } })
    } else {
      await prisma.notificacao.update({ where: { id }, data: { lida: true } })
    }
    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
