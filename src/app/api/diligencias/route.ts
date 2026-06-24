import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildInqueritoWhere } from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { isModuloAgendaAtivo } from '@/lib/agenda-module'
import { diligenciaCreateSchema } from '@/lib/validations/diligencia'
import type { Role } from '@/generated/prisma/enums'

function parseDate(s: string): Date | null {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!(await isModuloAgendaAtivo(role))) return apiError('Módulo Agenda desativado', 503)
    // ESTATISTICA é leitura global — não cria diligências.
    if (role === 'ESTATISTICA') return apiError('Sem permissão para criar diligências', 403)

    const body = await req.json().catch(() => null)
    const parsed = diligenciaCreateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    const data = parsed.data

    const dataInicio = parseDate(data.dataInicio)
    if (!dataInicio) return apiError('Data de início inválida', 400)
    const dataFim = data.dataFim ? parseDate(data.dataFim) : null
    if (data.dataFim && !dataFim) return apiError('Data de fim inválida', 400)
    if (dataFim && dataFim < dataInicio) return apiError('A data de fim não pode ser anterior à de início', 400)

    let inqueritoId: string | null = null
    if (data.inqueritoId) {
      const inq = await prisma.inquerito.findFirst({
        where: {
          AND: [
            { id: data.inqueritoId },
            { deletedAt: null },
            buildInqueritoWhere(role, session.user.id, session.user.brigadaId ?? null),
          ],
        },
        select: { id: true },
      })
      if (!inq) return apiError('Inquérito inválido ou fora do seu âmbito', 400)
      inqueritoId = inq.id
    }

    const diligencia = await prisma.diligencia.create({
      data: {
        titulo: data.titulo,
        tipo: data.tipo,
        dataInicio,
        dataFim,
        local: data.local ?? null,
        observacoes: data.observacoes ?? null,
        concluida: data.concluida ?? false,
        inqueritoId,
        criadoPorId: session.user.id,
      },
      select: { id: true },
    })

    await writeAudit({
      req,
      acao: 'CREATE_DILIGENCIA',
      entidade: 'Diligencia',
      entidadeId: diligencia.id,
      utilizadorId: session.user.id,
      detalhes: { titulo: data.titulo, tipo: data.tipo, inqueritoId },
    }).catch(() => {})

    return Response.json({ id: diligencia.id }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
