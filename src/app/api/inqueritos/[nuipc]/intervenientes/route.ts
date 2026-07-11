import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSession,
  handleApiError,
  apiError,
  buildInqueritoWhere,
  canEditInquerito,
} from '@/lib/auth-helpers'
import { writeAudit } from '@/lib/audit'
import { slugToNuipc } from '@/lib/utils'
import { intervenienteCreateSchema } from '@/lib/validations/interveniente'
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

/** Carrega o inquérito se o utilizador tiver acesso de leitura (scope RBAC). */
async function loadInquerito(nuipc: string, role: Role, userId: string, brigadaId: string | null) {
  return prisma.inquerito.findFirst({
    where: {
      AND: [{ nuipc }, { deletedAt: null }, buildInqueritoWhere(role, userId, brigadaId)],
    },
    select: { id: true, nuipc: true, inspetorId: true, brigadaId: true },
  })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const brigadaId = session.user.brigadaId ?? null
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)

    const inquerito = await loadInquerito(nuipc, role, session.user.id, brigadaId)
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    const items = await prisma.interveniente.findMany({
      where: { inqueritoid: inquerito.id },
      orderBy: { createdAt: 'asc' },
      select: INTERVENIENTE_SELECT,
    })

    // Mesma permissão do denunciante: editar o inquérito (titular/hierarquia).
    const podeGerir = canEditInquerito(role, session.user.id, brigadaId, inquerito)
    return Response.json({ items, podeGerir })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ nuipc: string }> }) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const brigadaId = session.user.brigadaId ?? null
    const { nuipc: slug } = await params
    const nuipc = slugToNuipc(slug)

    const inquerito = await loadInquerito(nuipc, role, session.user.id, brigadaId)
    if (!inquerito) return apiError('Inquérito não encontrado', 404)

    // Intervenientes são dados do inquérito (como o denunciante): editar exige
    // ser titular ou hierarquia. Colaborador operacional não altera aqui.
    if (!canEditInquerito(role, session.user.id, brigadaId, inquerito)) {
      return apiError('Sem permissão para gerir intervenientes neste inquérito', 403)
    }

    const parsed = intervenienteCreateSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
    const d = parsed.data

    const created = await prisma.interveniente.create({
      data: {
        inqueritoid: inquerito.id,
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
        // Responsável/representante só faz sentido para pessoa coletiva/pública.
        responsavel:
          d.tipoPessoa === 'COLETIVA' || d.tipoPessoa === 'ENTIDADE_PUBLICA'
            ? (d.responsavel ?? null)
            : null,
        notas: d.notas ?? null,
      },
      select: INTERVENIENTE_SELECT,
    })

    await writeAudit({
      req,
      acao: 'CREATE_INTERVENIENTE',
      entidade: 'Interveniente',
      entidadeId: created.id,
      utilizadorId: session.user.id,
      detalhes: { nuipc: inquerito.nuipc, tipo: created.tipo, nome: created.nome },
    }).catch(() => {})

    return Response.json(created, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
