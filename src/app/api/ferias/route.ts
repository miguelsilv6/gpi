import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { isModuloFeriasAtivo } from '@/lib/ferias-module'
import { countByTipo } from '@/lib/ferias'
import { ausenciaCreateSchema } from '@/lib/validations/ferias'
import { writeAudit } from '@/lib/audit'
import type { Role } from '@/generated/prisma/enums'

/** Parse 'YYYY-MM-DD' into a local-midnight Date. */
function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!(await isModuloFeriasAtivo()) && role !== 'ADMINISTRACAO') {
      return apiError('Módulo Férias está desativado', 503)
    }
    if (!hasPermission(role, 'ferias:own')) return apiError('Sem permissão', 403)

    const { searchParams } = new URL(req.url)
    const anoParam = searchParams.get('ano')
    const scope = searchParams.get('scope')
    const utilizadorIdParam = searchParams.get('utilizadorId')

    const ano = anoParam ? parseInt(anoParam, 10) : new Date().getFullYear()
    if (isNaN(ano) || ano < 2000 || ano > 2100) return apiError('Parâmetro ano inválido', 400)

    const yearStart = new Date(ano, 0, 1)
    const yearEnd = new Date(ano, 11, 31)
    const overlapWhere = { dataInicio: { lte: yearEnd }, dataFim: { gte: yearStart } }

    // ── Brigade overview (chefe / coordenador / admin) ──────────────────────
    if (scope === 'brigade') {
      const canViewAll = hasPermission(role, 'ferias:read:all')
      const canViewBrigade = hasPermission(role, 'ferias:read:brigade')
      if (!canViewAll && !canViewBrigade) {
        return apiError('Sem permissão para ver a visão de brigada', 403)
      }

      // read:brigade is locked to the requester's own brigade. read:all may
      // request a specific brigada, otherwise defaults to its own (if any).
      const brigadaIdParam = searchParams.get('brigadaId')
      let brigadaId: string | null
      if (canViewAll) {
        brigadaId = brigadaIdParam ?? session.user.brigadaId ?? null
      } else {
        if (!session.user.brigadaId) return apiError('Sessão sem brigada associada', 403)
        brigadaId = session.user.brigadaId
      }
      if (!brigadaId) return apiError('Indique uma brigada (brigadaId)', 400)

      const membros = await prisma.utilizador.findMany({
        where: { brigadaId, ativo: true, role: { in: ['INSPETOR', 'INSPETOR_CHEFE'] } },
        orderBy: { nome: 'asc' },
        select: {
          id: true,
          nome: true,
          ausencias: {
            where: { deletedAt: null, ...overlapWhere },
            orderBy: { dataInicio: 'asc' },
            select: { id: true, tipo: true, dataInicio: true, dataFim: true, nota: true },
          },
        },
      })

      const data = membros.map((m) => ({
        id: m.id,
        nome: m.nome,
        ausencias: m.ausencias,
        totais: countByTipo(m.ausencias, ano),
      }))

      return Response.json({ scope: 'brigade', ano, brigadaId, membros: data })
    }

    // ── Self (or another user's) list ───────────────────────────────────────
    let targetUserId = session.user.id
    if (utilizadorIdParam && utilizadorIdParam !== session.user.id) {
      const canViewAll = hasPermission(role, 'ferias:read:all')
      const canViewBrigade = hasPermission(role, 'ferias:read:brigade')
      if (!canViewAll && !canViewBrigade) {
        return apiError('Sem permissão para ver registos de outros utilizadores', 403)
      }
      if (!canViewAll && canViewBrigade) {
        const targetUser = await prisma.utilizador.findUnique({
          where: { id: utilizadorIdParam },
          select: { brigadaId: true },
        })
        if (
          !targetUser ||
          !targetUser.brigadaId ||
          !session.user.brigadaId ||
          targetUser.brigadaId !== session.user.brigadaId
        ) {
          return apiError('Sem permissão para ver registos deste utilizador', 403)
        }
      }
      targetUserId = utilizadorIdParam
    }

    const ausencias = await prisma.ausencia.findMany({
      where: { inspetorId: targetUserId, deletedAt: null, ...overlapWhere },
      orderBy: { dataInicio: 'asc' },
      select: { id: true, tipo: true, dataInicio: true, dataFim: true, nota: true },
    })

    return Response.json({
      scope: 'self',
      ano,
      utilizadorId: targetUserId,
      ausencias,
      totais: countByTipo(ausencias, ano),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!(await isModuloFeriasAtivo()) && role !== 'ADMINISTRACAO') {
      return apiError('Módulo Férias está desativado', 503)
    }
    if (!hasPermission(role, 'ferias:own')) return apiError('Sem permissão', 403)

    const body = await req.json()
    const parsed = ausenciaCreateSchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)

    const { tipo, nota } = parsed.data
    const dataInicio = parseDateOnly(parsed.data.dataInicio)
    const dataFim = parseDateOnly(parsed.data.dataFim)

    // Overlap guard: reject a same-tipo range that overlaps an existing one so
    // day counts never double-count. A different tipo on the same days is allowed.
    const overlap = await prisma.ausencia.findFirst({
      where: {
        inspetorId: session.user.id,
        tipo,
        deletedAt: null,
        dataInicio: { lte: dataFim },
        dataFim: { gte: dataInicio },
      },
      select: { id: true },
    })
    if (overlap) {
      return apiError('Já existe uma marcação do mesmo tipo que se sobrepõe a este período', 409)
    }

    const ausencia = await prisma.ausencia.create({
      data: {
        inspetorId: session.user.id,
        brigadaId: session.user.brigadaId, // snapshot
        tipo,
        dataInicio,
        dataFim,
        nota: nota ?? null,
      },
      select: { id: true, tipo: true, dataInicio: true, dataFim: true, nota: true },
    })

    await writeAudit({
      req,
      acao: 'CREATE_AUSENCIA',
      entidade: 'Ausencia',
      entidadeId: ausencia.id,
      utilizadorId: session.user.id,
      detalhes: { tipo, dataInicio: parsed.data.dataInicio, dataFim: parsed.data.dataFim } as never,
    })

    return Response.json({ ausencia }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
