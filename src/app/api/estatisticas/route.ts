import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import type { Role } from '@/generated/prisma/enums'

const querySchema = z.object({
  brigadaId: z.string().optional(),
  inspetorId: z.string().optional(),
  dataInicio: z.string().date('dataInicio inválida').optional(),
  dataFim: z.string().date('dataFim inválida').optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!hasPermission(role, 'estatistica:read')) {
      return apiError('Sem permissão para ver estatísticas', 403)
    }

    const { searchParams } = new URL(req.url)
    const parsed = querySchema.safeParse({
      brigadaId: searchParams.get('brigadaId') ?? undefined,
      inspetorId: searchParams.get('inspetorId') ?? undefined,
      dataInicio: searchParams.get('dataInicio') ?? undefined,
      dataFim: searchParams.get('dataFim') ?? undefined,
    })
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { brigadaId: requestedBrigadaId, inspetorId, dataInicio, dataFim } = parsed.data

    // INSPETOR_CHEFE is locked to their own brigada.
    const brigadaId =
      role === 'INSPETOR_CHEFE'
        ? session.user.brigadaId ?? '__no_brigada__'
        : requestedBrigadaId

    if (role === 'INSPETOR_CHEFE' && !session.user.brigadaId) {
      return apiError('Sessão sem brigada associada — refresh ou re-login', 403)
    }

    // Defense in depth: for chefe, validate the inspetor (if any) belongs to
    // their brigada. Skipping this would let a crafted URL probe across brigadas.
    if (role === 'INSPETOR_CHEFE' && inspetorId) {
      const inspetor = await prisma.utilizador.findUnique({
        where: { id: inspetorId },
        select: { brigadaId: true },
      })
      if (!inspetor || inspetor.brigadaId !== session.user.brigadaId) {
        return apiError('Inspetor fora da sua brigada', 403)
      }
    }

    const where = {
      // Inquéritos soft-deleted não contam para estatística — alinhado com a
      // listagem /inqueritos (que filtra deletedAt: null). Sem isto, um
      // inquérito apagado aparecia nos contadores mas não na lista.
      deletedAt: null,
      ...(brigadaId && { brigadaId }),
      ...(inspetorId && { inspetorId }),
      ...(dataInicio || dataFim
        ? {
            dataAbertura: {
              ...(dataInicio && { gte: new Date(dataInicio) }),
              ...(dataFim && { lte: new Date(dataFim) }),
            },
          }
        : {}),
    }

    // Names of padroes flagged with a dashboard category — needed for the
    // Aguarda Exames / Enviados counters. Computed once and used in both
    // counter queries below.
    const padroesCategoria = await prisma.atividadePadrao.findMany({
      where: { ativa: true, categoriaDashboard: { not: null } },
      select: { nome: true, categoriaDashboard: true },
    })
    const nomesAguardaExames = padroesCategoria
      .filter((p) => p.categoriaDashboard === 'AGUARDA_EXAMES')
      .map((p) => p.nome)
    const nomesEnviados = padroesCategoria
      .filter((p) => p.categoriaDashboard === 'ENVIADO')
      .map((p) => p.nome)

    const [
      porEstadoRaw,
      porBrigada,
      porInspetorRaw,
      porNatureza,
      total,
      vencidos,
      semInspetor,
      aguardaExames,
      enviados,
    ] = await Promise.all([
      prisma.inquerito.groupBy({ by: ['estadoId'], where, _count: true }),
      prisma.inquerito.groupBy({
        by: ['brigadaId'],
        where,
        _count: true,
        orderBy: { _count: { brigadaId: 'desc' } },
      }),
      // Skip the inspetor breakdown when an inspetor is already selected —
      // the chart would be a single bar, which adds no information. The UI
      // replaces it with atividadesInspetor (below).
      inspetorId
        ? Promise.resolve([] as { inspetorId: string | null; _count: number }[])
        : prisma.inquerito.groupBy({
            by: ['inspetorId'],
            where: { ...where, inspetorId: { not: null } },
            _count: true,
            orderBy: { _count: { inspetorId: 'desc' } },
            take: 20,
          }),
      prisma.inquerito.groupBy({
        by: ['natureza'],
        where,
        _count: true,
        orderBy: { _count: { natureza: 'desc' } },
        take: 10,
      }),
      prisma.inquerito.count({ where }),
      prisma.inquerito.count({
        where: {
          ...where,
          dataPrazo: { lt: new Date() },
          estado: { terminal: false },
        },
      }),
      prisma.inquerito.count({
        where: { ...where, inspetorId: null, estado: { terminal: false } },
      }),
      // Aguarda Exames / Enviados — mesma semântica do Dashboard: inquéritos
      // ativos (não-terminal) que tenham pelo menos uma atividade da
      // categoria correspondente AINDA não concluída. Respeita os filtros
      // brigada/inspetor da página; o filtro de data não se aplica (são
      // contadores "actuais", não períodos).
      nomesAguardaExames.length === 0
        ? Promise.resolve(0)
        : prisma.inquerito.count({
            where: {
              ...(brigadaId && { brigadaId }),
              ...(inspetorId && { inspetorId }),
              deletedAt: null,
              estado: { terminal: false },
              atividades: {
                some: { descricao: { in: nomesAguardaExames }, concluidaEm: null },
              },
            },
          }),
      nomesEnviados.length === 0
        ? Promise.resolve(0)
        : prisma.inquerito.count({
            where: {
              ...(brigadaId && { brigadaId }),
              ...(inspetorId && { inspetorId }),
              deletedAt: null,
              estado: { terminal: false },
              atividades: {
                some: { descricao: { in: nomesEnviados }, concluidaEm: null },
              },
            },
          }),
    ])

    // Atividade breakdown for the selected inspetor (only when filtered).
    // The date filter is applied to atividade.dataRealizacao (not
    // inquerito.dataAbertura) — that matches what the user wants to know:
    // "what did this inspetor do in this period?"
    let atividadesInspetor: {
      descricao: string
      count: number
      sumQuantidade: number
      temQuantidade: boolean
    }[] = []
    let atividadesInspetorTotal = 0
    if (inspetorId) {
      const periodWhere = {
        ...(dataInicio && { gte: new Date(dataInicio) }),
        ...(dataFim && { lte: new Date(dataFim) }),
      }
      const atividades = await prisma.atividade.findMany({
        where: {
          inquerito: { inspetorId, deletedAt: null },
          ...(dataInicio || dataFim ? { dataRealizacao: periodWhere } : {}),
        },
        select: { descricao: true, quantidade: true },
      })

      // Map descricao → padrão metadata so the UI knows when to show "1× (total: 4)".
      const padroes = await prisma.atividadePadrao.findMany({
        where: { nome: { in: Array.from(new Set(atividades.map((a) => a.descricao))) } },
        select: { nome: true, temQuantidade: true },
      })
      const temQtdByNome = new Map(padroes.map((p) => [p.nome, p.temQuantidade]))

      const acc = new Map<string, { count: number; sumQ: number; temQ: boolean }>()
      for (const a of atividades) {
        const cur = acc.get(a.descricao) ?? {
          count: 0,
          sumQ: 0,
          temQ: temQtdByNome.get(a.descricao) ?? false,
        }
        cur.count++
        if (cur.temQ && a.quantidade && a.quantidade > 0) cur.sumQ += a.quantidade
        acc.set(a.descricao, cur)
      }
      atividadesInspetor = Array.from(acc.entries())
        .map(([descricao, v]) => ({
          descricao,
          count: v.count,
          sumQuantidade: v.sumQ,
          temQuantidade: v.temQ,
        }))
        .sort((a, b) => b.count - a.count)
      atividadesInspetorTotal = atividades.length
    }

    // Enrich groupBy with related labels
    const inspetorIds = porInspetorRaw
      .map((r) => r.inspetorId)
      .filter((id): id is string => id !== null)
    const [brigadas, estados, inspetores] = await Promise.all([
      prisma.brigada.findMany({
        where: { id: { in: porBrigada.map((b) => b.brigadaId) } },
        select: { id: true, nome: true },
      }),
      prisma.estadoInquerito.findMany({
        where: { id: { in: porEstadoRaw.map((e) => e.estadoId) } },
        select: { id: true, codigo: true, nome: true, cor: true },
      }),
      inspetorIds.length
        ? prisma.utilizador.findMany({
            where: { id: { in: inspetorIds } },
            select: { id: true, nome: true },
          })
        : Promise.resolve([]),
    ])
    const brigadaNomes = Object.fromEntries(brigadas.map((b) => [b.id, b.nome]))
    const estadoById = new Map(estados.map((e) => [e.id, e]))
    const inspetorNomes = Object.fromEntries(inspetores.map((u) => [u.id, u.nome]))

    return Response.json({
      total,
      vencidos,
      semInspetor,
      aguardaExames,
      enviados,
      porEstado: porEstadoRaw.map((r) => {
        const e = estadoById.get(r.estadoId)
        return {
          estadoId: r.estadoId,
          codigo: e?.codigo ?? '',
          nome: e?.nome ?? '',
          cor: e?.cor ?? null,
          count: r._count,
        }
      }),
      porBrigada: porBrigada.map((r) => ({
        brigadaId: r.brigadaId,
        nome: brigadaNomes[r.brigadaId] ?? r.brigadaId,
        count: r._count,
      })),
      porInspetor: porInspetorRaw
        .filter((r) => r.inspetorId !== null)
        .map((r) => ({
          inspetorId: r.inspetorId!,
          nome: inspetorNomes[r.inspetorId!] ?? '—',
          count: r._count,
        })),
      porNatureza: porNatureza.map((r) => ({ natureza: r.natureza, count: r._count })),
      atividadesInspetor,
      atividadesInspetorTotal,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
