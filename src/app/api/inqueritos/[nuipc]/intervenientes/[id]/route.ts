import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSession,
  handleApiError,
  apiError,
  buildInqueritoWhere,
  canEditInquerito,
} from '@/lib/auth-helpers'
import { writeAudit, diff } from '@/lib/audit'
import { slugToNuipc } from '@/lib/utils'
import { intervenienteUpdateSchema } from '@/lib/validations/interveniente'
import type { Role } from '@/generated/prisma/enums'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INTERVENIENTE_SELECT = {
  id: true,
  tipo: true,
  tipoOutro: true,
  nome: true,
  tipoPessoa: true,
  nif: true,
  morada: true,
  codPostal: true,
  localidade: true,
  contacto: true,
  email: true,
  responsavel: true,
  notas: true,
  createdAt: true,
} as const

// Campos comparados no diff de auditoria (updates).
const AUDIT_KEYS = [
  'tipo',
  'tipoOutro',
  'nome',
  'tipoPessoa',
  'nif',
  'morada',
  'codPostal',
  'localidade',
  'contacto',
  'email',
  'responsavel',
  'notas',
] as const

/**
 * Carrega o inquérito com scope de leitura e, dentro dele, garante que o
 * interveniente pertence mesmo a este inquérito (defesa contra IDs cruzados).
 * Devolve tanto o inquérito (para o gate de escrita) como o interveniente.
 */
async function loadInqueritoEInterveniente(
  nuipc: string,
  intervenienteId: string,
  role: Role,
  userId: string,
  brigadaId: string | null,
) {
  const inquerito = await prisma.inquerito.findFirst({
    where: {
      AND: [{ nuipc }, { deletedAt: null }, buildInqueritoWhere(role, userId, brigadaId)],
    },
    select: { id: true, nuipc: true, inspetorId: true, brigadaId: true },
  })
  if (!inquerito) return { inquerito: null, interveniente: null }
  const interveniente = await prisma.interveniente.findFirst({
    where: { id: intervenienteId, inqueritoid: inquerito.id },
    select: INTERVENIENTE_SELECT,
  })
  return { inquerito, interveniente }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const brigadaId = session.user.brigadaId ?? null
    const { nuipc: slug, id } = await params
    const nuipc = slugToNuipc(slug)

    const { inquerito, interveniente } = await loadInqueritoEInterveniente(
      nuipc,
      id,
      role,
      session.user.id,
      brigadaId,
    )
    if (!inquerito || !interveniente) return apiError('Interveniente não encontrado', 404)

    if (!canEditInquerito(role, session.user.id, brigadaId, inquerito)) {
      return apiError('Sem permissão para gerir intervenientes neste inquérito', 403)
    }

    const parsed = intervenienteUpdateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    const d = parsed.data

    const updated = await prisma.interveniente.update({
      where: { id: interveniente.id },
      data: {
        tipo: d.tipo,
        tipoOutro: d.tipo === 'OUTRO' ? (d.tipoOutro ?? null) : null,
        nome: d.nome,
        tipoPessoa: d.tipoPessoa ?? null,
        nif: d.nif ?? null,
        morada: d.morada ?? null,
        codPostal: d.codPostal ?? null,
        localidade: d.localidade ?? null,
        contacto: d.contacto ?? null,
        email: d.email ?? null,
        // Responsável/representante só faz sentido para pessoa coletiva/pública;
        // se a natureza mudar para singular, limpa-se (integridade dos dados).
        responsavel:
          d.tipoPessoa === 'COLETIVA' || d.tipoPessoa === 'ENTIDADE_PUBLICA'
            ? (d.responsavel ?? null)
            : null,
        notas: d.notas ?? null,
      },
      select: INTERVENIENTE_SELECT,
    })

    const delta = diff(interveniente, updated, AUDIT_KEYS)
    if (delta) {
      await writeAudit({
        req,
        acao: 'UPDATE_INTERVENIENTE',
        entidade: 'Interveniente',
        entidadeId: updated.id,
        utilizadorId: session.user.id,
        detalhes: { nuipc: inquerito.nuipc, nome: updated.nome, ...delta },
      }).catch(() => {})
    }

    return Response.json(updated)
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ nuipc: string; id: string }> },
) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const brigadaId = session.user.brigadaId ?? null
    const { nuipc: slug, id } = await params
    const nuipc = slugToNuipc(slug)

    const { inquerito, interveniente } = await loadInqueritoEInterveniente(
      nuipc,
      id,
      role,
      session.user.id,
      brigadaId,
    )
    if (!inquerito || !interveniente) return apiError('Interveniente não encontrado', 404)

    if (!canEditInquerito(role, session.user.id, brigadaId, inquerito)) {
      return apiError('Sem permissão para gerir intervenientes neste inquérito', 403)
    }

    await prisma.interveniente.delete({ where: { id: interveniente.id } })

    await writeAudit({
      req,
      acao: 'DELETE_INTERVENIENTE',
      entidade: 'Interveniente',
      entidadeId: interveniente.id,
      utilizadorId: session.user.id,
      detalhes: { nuipc: inquerito.nuipc, tipo: interveniente.tipo, nome: interveniente.nome },
    }).catch(() => {})

    return Response.json({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
