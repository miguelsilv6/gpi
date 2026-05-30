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
import { findEstadoById, getDistribuidoEstado } from '@/lib/estados'
import { notifyInqueritoAtribuido } from '@/lib/notifications'
import { slugToNuipc, nuipcToSlug } from '@/lib/utils'
import { canTransition, isTerminal } from '@/lib/inquerito-state'
import { diff, writeAudit } from '@/lib/audit'
import type { Role } from '@/generated/prisma/enums'

const ESTADO_INCLUDE = {
  select: { id: true, codigo: true, nome: true, cor: true, terminal: true, ativo: true },
} as const

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
        estado: ESTADO_INCLUDE,
        crime: { select: { id: true, nome: true } },
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

    const existing = await prisma.inquerito.findUnique({
      where: { nuipc },
      include: {
        estado: ESTADO_INCLUDE,
        etiquetas: { select: { id: true, nome: true } },
        crimesAssociados: { select: { id: true, nome: true } },
      },
    })
    if (!existing || existing.deletedAt) return apiError('Inquérito não encontrado', 404)

    if (!canEditInquerito(role, session.user.id, session.user.brigadaId, existing)) {
      return apiError('Sem permissão para editar este inquérito', 403)
    }

    const body = await req.json()
    const parsed = inqueritoSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const data = parsed.data
    const inspetorId = data.inspetorId && data.inspetorId.length > 0 ? data.inspetorId : null

    // Resolve target estado
    const targetEstado = await findEstadoById(data.estadoId)
    if (!targetEstado || !targetEstado.ativo) return apiError('Estado inválido', 400)

    // Resolve target crime
    const targetCrime = await prisma.crime.findUnique({
      where: { id: data.crimeId },
      select: { id: true, nome: true, ativo: true },
    })
    if (!targetCrime || !targetCrime.ativo) return apiError('Crime inválido', 400)

    // Terminal-state full lock: if the inquérito is in a terminal state AND the
    // user is not transitioning out of it (same target), editing is forbidden.
    // To change anything in a terminal inquérito, it must be reopened first.
    if (existing.estado.terminal && targetEstado.id === existing.estadoId) {
      return apiError(
        'Inquérito em estado terminal é só de leitura. Use a reabertura para reactivar.',
        409,
      )
    }

    // State machine
    if (data.estadoId !== existing.estadoId && !canTransition(existing.estado, targetEstado)) {
      return apiError(
        `Transição inválida: ${existing.estado.codigo} → ${targetEstado.codigo}. Use a reabertura se necessário.`,
        409,
      )
    }

    // Date / state consistency
    const conclusao = data.dataConclusao ? new Date(data.dataConclusao) : null
    if (isTerminal(targetEstado) && !conclusao) {
      return apiError('Estado terminal exige data de conclusão', 400)
    }
    if (!isTerminal(targetEstado) && conclusao) {
      return apiError('Data de conclusão só se aplica a estados terminais', 400)
    }

    // NUIPC change: validate uniqueness and that the change is permitted
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

    // Inspetor change: validate brigada match
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

    // Etiquetas: como as tags são pessoais mas "viajam" com o inquérito, o
    // utilizador pode manter as que já estavam aplicadas (mesmo de outros) e
    // adicionar as suas próprias. Não pode aplicar tags de outro utilizador
    // que ainda não estivessem no inquérito.
    const etiquetaIds = [...new Set(data.etiquetaIds ?? [])]
    const existingEtiquetaIds = new Set(existing.etiquetas.map((e) => e.id))
    if (etiquetaIds.length > 0) {
      const found = await prisma.etiqueta.findMany({
        where: { id: { in: etiquetaIds } },
        select: { id: true, nome: true, criadoPorId: true },
      })
      if (found.length !== etiquetaIds.length) {
        return apiError('Uma ou mais etiquetas não existem', 400)
      }
      for (const f of found) {
        const isOwn = f.criadoPorId === session.user.id
        const wasAttached = existingEtiquetaIds.has(f.id)
        if (!isOwn && !wasAttached) {
          return apiError(`Etiqueta "${f.nome}" pertence a outro utilizador`, 403)
        }
      }
    }

    // Crimes associados: deduplicate, exclude primary crime, validate existence.
    const crimeIdsAssociados = [
      ...new Set((data.crimeIdsAssociados ?? []).filter((id) => id !== targetCrime.id)),
    ]
    if (crimeIdsAssociados.length > 0) {
      const foundAssociados = await prisma.crime.findMany({
        where: { id: { in: crimeIdsAssociados } },
        select: { id: true },
      })
      if (foundAssociados.length !== crimeIdsAssociados.length) {
        return apiError('Um ou mais crimes associados não existem', 400)
      }
    }
    const existingCrimeAssociadosIds = new Set(existing.crimesAssociados.map((c) => c.id))
    const crimesAssociadosMudaram =
      existingCrimeAssociadosIds.size !== crimeIdsAssociados.length ||
      crimeIdsAssociados.some((id) => !existingCrimeAssociadosIds.has(id))

    // Auto-transition: inspector newly assigned on an ABERTO inquérito, and
    // the user hasn't explicitly chosen a different estado → set DISTRIBUIDO.
    let finalEstadoId = data.estadoId
    if (
      inspetorId &&
      !existing.inspetorId &&
      existing.estado.codigo === 'ABERTO' &&
      data.estadoId === existing.estadoId
    ) {
      const distribuido = await getDistribuidoEstado()
      if (distribuido?.ativo) {
        finalEstadoId = distribuido.id
        Object.assign(targetEstado, distribuido)
      }
    }

    const updated = await prisma.inquerito.update({
      where: { nuipc },
      data: {
        nuipc: data.nuipc,
        nai: data.nai || null,
        // natureza is denormalized from crime.nome while the legacy column exists
        natureza: targetCrime.nome,
        crimeId: targetCrime.id,
        estadoId: finalEstadoId,
        dataAbertura: new Date(data.dataAbertura),
        dataPrazo: data.dataPrazo ? new Date(data.dataPrazo) : null,
        dataConclusao: conclusao,
        notas: data.notas ?? null,
        inspetorId,
        tribunal: data.tribunal?.trim() || null,
        procurador: data.procurador?.trim() || null,
        oficialJustica: data.oficialJustica?.trim() || null,
        voip: data.voip?.trim() || null,
        notasTribunal: data.notasTribunal?.trim() || null,
        denuncianteNome: data.denuncianteNome?.trim() || null,
        denuncianteTipo: data.denuncianteTipo || null,
        denuncianteNif: data.denuncianteNif?.trim() || null,
        denuncianteMorada: data.denuncianteMorada?.trim() || null,
        denuncianteCodPostal: data.denuncianteCodPostal?.trim() || null,
        denuncianteLocalidade: data.denuncianteLocalidade?.trim() || null,
        denuncianteContacto: data.denuncianteContacto?.trim() || null,
        denuncianteEmail: data.denuncianteEmail?.trim() || null,
        denuncianteResponsavel: data.denuncianteResponsavel?.trim() || null,
        denuncianteNotas: data.denuncianteNotas?.trim() || null,
        etiquetas: { set: etiquetaIds.map((id) => ({ id })) },
        crimesAssociados: { set: crimeIdsAssociados.map((id) => ({ id })) },
      },
      include: {
        etiquetas: { select: { id: true, nome: true } },
        crimesAssociados: { select: { id: true, nome: true } },
      },
    })

    // Etiqueta change detection (diff() only covers scalars). Compare by id set.
    const etiquetasMudaram =
      existingEtiquetaIds.size !== updated.etiquetas.length ||
      updated.etiquetas.some((e) => !existingEtiquetaIds.has(e.id))
    const etiquetasBefore = existing.etiquetas.map((e) => e.nome)
    const etiquetasAfter = updated.etiquetas.map((e) => e.nome)

    // Audit diff. We log estado as the codigo (stable across renames).
    const before = {
      nuipc: existing.nuipc,
      nai: existing.nai,
      crimeId: existing.crimeId,
      estadoCodigo: existing.estado.codigo,
      dataAbertura: existing.dataAbertura,
      dataPrazo: existing.dataPrazo,
      dataConclusao: existing.dataConclusao,
      inspetorId: existing.inspetorId,
      tribunal: existing.tribunal,
      procurador: existing.procurador,
      oficialJustica: existing.oficialJustica,
      voip: existing.voip,
      notasTribunal: existing.notasTribunal,
      denuncianteNome: existing.denuncianteNome,
      denuncianteTipo: existing.denuncianteTipo,
      denuncianteNif: existing.denuncianteNif,
      denuncianteMorada: existing.denuncianteMorada,
      denuncianteCodPostal: existing.denuncianteCodPostal,
      denuncianteLocalidade: existing.denuncianteLocalidade,
      denuncianteContacto: existing.denuncianteContacto,
      denuncianteEmail: existing.denuncianteEmail,
      denuncianteResponsavel: existing.denuncianteResponsavel,
      denuncianteNotas: existing.denuncianteNotas,
    }
    const after = {
      nuipc: updated.nuipc,
      nai: updated.nai,
      crimeId: updated.crimeId,
      estadoCodigo: targetEstado.codigo,
      dataAbertura: updated.dataAbertura,
      dataPrazo: updated.dataPrazo,
      dataConclusao: updated.dataConclusao,
      inspetorId: updated.inspetorId,
      tribunal: updated.tribunal,
      procurador: updated.procurador,
      oficialJustica: updated.oficialJustica,
      voip: updated.voip,
      notasTribunal: updated.notasTribunal,
      denuncianteNome: updated.denuncianteNome,
      denuncianteTipo: updated.denuncianteTipo,
      denuncianteNif: updated.denuncianteNif,
      denuncianteMorada: updated.denuncianteMorada,
      denuncianteCodPostal: updated.denuncianteCodPostal,
      denuncianteLocalidade: updated.denuncianteLocalidade,
      denuncianteContacto: updated.denuncianteContacto,
      denuncianteEmail: updated.denuncianteEmail,
      denuncianteResponsavel: updated.denuncianteResponsavel,
      denuncianteNotas: updated.denuncianteNotas,
    }
    const changes = diff(before, after, [
      'nuipc',
      'nai',
      'crimeId',
      'estadoCodigo',
      'dataAbertura',
      'dataPrazo',
      'dataConclusao',
      'inspetorId',
      'tribunal',
      'procurador',
      'oficialJustica',
      'voip',
      'notasTribunal',
      'denuncianteNome',
      'denuncianteTipo',
      'denuncianteNif',
      'denuncianteMorada',
      'denuncianteCodPostal',
      'denuncianteLocalidade',
      'denuncianteContacto',
      'denuncianteEmail',
      'denuncianteResponsavel',
      'denuncianteNotas',
    ])

    const crimesAssociadosBefore = existing.crimesAssociados.map((c) => c.nome)
    const crimesAssociadosAfter = updated.crimesAssociados.map((c) => c.nome)

    if (changes || etiquetasMudaram || crimesAssociadosMudaram) {
      await writeAudit({
        req,
        acao: 'UPDATE_INQUERITO',
        entidade: 'Inquerito',
        entidadeId: updated.id,
        utilizadorId: session.user.id,
        detalhes: {
          ...(changes ?? {}),
          ...(etiquetasMudaram && { etiquetasBefore, etiquetasAfter }),
          ...(crimesAssociadosMudaram && { crimesAssociadosBefore, crimesAssociadosAfter }),
        } as never,
      })
    }

    const inspetorChanged = updated.inspetorId && updated.inspetorId !== existing.inspetorId
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
    const existing = await prisma.inquerito.findUnique({
      where: { nuipc },
      include: { estado: ESTADO_INCLUDE },
    })
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
      detalhes: { nuipc: existing.nuipc, estadoCodigo: existing.estado.codigo },
    })

    revalidatePath('/inqueritos')
    revalidatePath('/dashboard')
    return new Response(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
