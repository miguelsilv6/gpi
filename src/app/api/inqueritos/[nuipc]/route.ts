import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import {
  getSession,
  buildInqueritoWhere,
  canEditInquerito,
  handleApiError,
  apiError,
} from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { inqueritoSchema } from '@/lib/validations/inquerito'
import { notifyInqueritoAtribuido } from '@/lib/notifications'
import { slugToNuipc, nuipcToSlug } from '@/lib/utils'
import { canTransition } from '@/lib/inquerito-state'
import { diff, writeAudit } from '@/lib/audit'
import type { Role } from '@/generated/prisma/enums'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const session = await getSession()
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)
    const role = session.user.role as Role
    const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)

    const inquerito = await prisma.inquerito.findFirst({
      where: { nuipc, deletedAt: null, ...roleWhere },
      include: {
        brigada: { select: { id: true, nome: true } },
        inspetor: { select: { id: true, nome: true, email: true } },
        atividades: {
          orderBy: { dataRealizacao: 'desc' },
          include: { realizadaPor: { select: { id: true, nome: true } } },
        },
      },
    })

    if (!inquerito) return apiError('Inquérito não encontrado', 404)
    return Response.json(inquerito)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const session = await getSession()
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)
    const role = session.user.role as Role

    const existing = await prisma.inquerito.findUnique({ where: { nuipc } })
    if (!existing || existing.deletedAt) return apiError('Inquérito não encontrado', 404)

    if (!canEditInquerito(role, session.user.id, session.user.brigadaId, existing)) {
      return apiError('Sem permissão para editar este inquérito', 403)
    }

    const body = await req.json()
    const parsed = inqueritoSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = parsed.data

    // Terminal-state lock: arquivado is read-only via PUT.
    // CONCLUIDO is editable for non-state-changing fields (closures need amendments).
    if (existing.estado === 'ARQUIVADO' && data.estado === 'ARQUIVADO') {
      return apiError('Inquérito arquivado é só de leitura. Use a reabertura.', 409)
    }

    // State machine
    if (data.estado !== existing.estado && !canTransition(existing.estado, data.estado)) {
      return apiError(
        `Transição inválida: ${existing.estado} → ${data.estado}. Use a reabertura se necessário.`,
        409,
      )
    }

    // Going from non-terminal to terminal: only via dedicated endpoint? No — allowed here
    // but it stamps dataConclusao via the schema's superRefine.

    // NUIPC change: validate uniqueness and that the change is permitted (admin/coordenador)
    if (data.nuipc !== nuipc) {
      if (!hasPermission(role, 'inquerito:edit:all')) {
        return apiError('Apenas coordenação/administração pode alterar o NUIPC', 403)
      }
      const dup = await prisma.inquerito.findUnique({ where: { nuipc: data.nuipc } })
      if (dup) return apiError('NUIPC já existe', 409)
    }

    // Brigada change: only via transfer endpoint
    if (data.brigadaId !== existing.brigadaId) {
      return apiError('Use o endpoint de transferência para alterar a brigada', 409)
    }

    // Normalize empty string → null for optional FK
    const inspetorId = data.inspetorId && data.inspetorId.length > 0 ? data.inspetorId : null

    // Inspetor change: validate inspetor belongs to the inquérito's brigada
    if (inspetorId && inspetorId !== existing.inspetorId) {
      const inspetor = await prisma.utilizador.findUnique({
        where: { id: inspetorId },
        select: { id: true, ativo: true, brigadaId: true, role: true, email: true, nome: true },
      })
      if (!inspetor || !inspetor.ativo) return apiError('Inspetor inválido', 400)
      if (inspetor.brigadaId !== existing.brigadaId) {
        return apiError('Inspetor não pertence à brigada do inquérito', 409)
      }
    }

    const updated = await prisma.inquerito.update({
      where: { nuipc },
      data: {
        nuipc: data.nuipc,
        nai: data.nai || null,
        natureza: data.natureza,
        estado: data.estado,
        faseProcessual: data.faseProcessual,
        dataAbertura: new Date(data.dataAbertura),
        dataPrazo: data.dataPrazo ? new Date(data.dataPrazo) : null,
        dataConclusao: data.dataConclusao ? new Date(data.dataConclusao) : null,
        notas: data.notas ?? null,
        inspetorId,
      },
    })

    const changes = diff(existing, updated, [
      'nuipc',
      'nai',
      'natureza',
      'estado',
      'faseProcessual',
      'dataAbertura',
      'dataPrazo',
      'dataConclusao',
      'inspetorId',
    ])

    if (changes) {
      await writeAudit({
        req,
        acao: 'UPDATE_INQUERITO',
        entidade: 'Inquerito',
        entidadeId: updated.id,
        utilizadorId: session.user.id,
        detalhes: changes as never,
      })
    }

    // Notify on inspetor assignment
    const inspetorChanged =
      updated.inspetorId && updated.inspetorId !== existing.inspetorId
    if (inspetorChanged) {
      const inspetor = await prisma.utilizador.findUnique({
        where: { id: updated.inspetorId! },
        select: { id: true, email: true, nome: true },
      })
      if (inspetor) {
        notifyInqueritoAtribuido({
          inqueritoid: updated.id,
          nuipc: updated.nuipc,
          inspetorId: inspetor.id,
          inspetorEmail: inspetor.email,
          inspetorNome: inspetor.nome,
        }).catch(() => {})
      }
    }

    revalidatePath('/inqueritos')
    revalidatePath(`/inqueritos/${slug}`)
    if (updated.nuipc !== existing.nuipc) {
      revalidatePath(`/inqueritos/${nuipcToSlug(updated.nuipc)}`)
    }
    revalidatePath('/dashboard')

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

// Soft delete (ADMINISTRACAO only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:delete')) {
      return apiError('Sem permissão para apagar inquérito', 403)
    }

    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)
    const existing = await prisma.inquerito.findUnique({ where: { nuipc } })
    if (!existing || existing.deletedAt) return apiError('Inquérito não encontrado', 404)

    await prisma.inquerito.update({
      where: { nuipc },
      data: { deletedAt: new Date() },
    })

    await writeAudit({
      req,
      acao: 'DELETE_INQUERITO',
      entidade: 'Inquerito',
      entidadeId: existing.id,
      utilizadorId: session.user.id,
      detalhes: { nuipc: existing.nuipc, estado: existing.estado },
    })

    revalidatePath('/inqueritos')
    revalidatePath('/dashboard')
    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}

