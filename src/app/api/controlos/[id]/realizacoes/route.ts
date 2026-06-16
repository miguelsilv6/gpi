import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { CONTROLO_SELECT } from '@/lib/controlos'
import { z } from 'zod'
import type { Role } from '@/generated/prisma/enums'
import { hasPermission } from '@/lib/rbac'

const confirmSchema = z.object({
  realizacaoId: z.string().min(1),
  observacoes: z.string().max(2000).optional().nullable(),
  dataRealizacao: z.string().optional().refine(
    (val) => !val || !isNaN(Date.parse(val)),
    { message: 'Data de realização inválida' },
  ),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const { id: controloId } = await params

    const body = await req.json()
    const parsed = confirmSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { realizacaoId, observacoes, dataRealizacao } = parsed.data

    // Load the controlo and check access
    const controlo = await prisma.controlo.findUnique({
      where: { id: controloId },
      select: {
        id: true,
        criadorId: true,
        periodoDias: true,
        concluidoEm: true,
        realizacoes: {
          where: { id: realizacaoId },
          select: { id: true, numero: true, dataEsperada: true, dataRealizacao: true },
        },
      },
    })

    if (!controlo) return apiError('Controlo não encontrado', 404)
    if (controlo.concluidoEm) return apiError('Controlo já concluído', 409)

    const canConfirm =
      controlo.criadorId === session.user.id ||
      hasPermission(role, 'controlo:read:all')

    if (!canConfirm) return apiError('Sem permissão para confirmar este controlo', 403)

    const realizacao = controlo.realizacoes[0]
    if (!realizacao) return apiError('Realização não encontrada', 404)

    const dataRealizacaoDate = dataRealizacao ? new Date(dataRealizacao) : new Date()

    const result = await prisma.$transaction(async (tx) => {
      // Atomic confirmation — updateMany with dataRealizacao: null prevents
      // duplicate confirmations under concurrent requests (race condition guard).
      const updateResult = await tx.controloRealizacao.updateMany({
        where: { id: realizacaoId, dataRealizacao: null },
        data: {
          dataRealizacao: dataRealizacaoDate,
          observacoes: observacoes ?? null,
          realizadoPorId: session.user.id,
        },
      })

      if (updateResult.count === 0) {
        throw new Error('Realização já confirmada', { cause: 409 })
      }

      // If periodic, create the next realizacao
      if (controlo.periodoDias) {
        const currentExpected =
          realizacao.dataEsperada instanceof Date
            ? realizacao.dataEsperada
            : new Date(realizacao.dataEsperada)
        const nextDate = new Date(currentExpected)
        nextDate.setUTCDate(nextDate.getUTCDate() + controlo.periodoDias)

        await tx.controloRealizacao.create({
          data: {
            controloId,
            numero: realizacao.numero + 1,
            dataEsperada: nextDate,
          },
        })
      }

      await tx.auditLog.create({
        data: {
          acao: 'CONFIRM_CONTROLO_REALIZACAO',
          entidade: 'ControloRealizacao',
          entidadeId: realizacaoId,
          utilizadorId: session.user.id,
          detalhes: {
            controloId,
            numero: realizacao.numero,
            dataRealizacao: dataRealizacaoDate.toISOString(),
          } as never,
        },
      })

      return tx.controlo.findUnique({ where: { id: controloId }, select: CONTROLO_SELECT })
    })

    return Response.json(result)
  } catch (error) {
    return handleApiError(error)
  }
}
