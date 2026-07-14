import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { getInqueritoCounters, getComarcaBreakdown } from '@/lib/estatisticas-counters'
import { utcDayRangeFilter } from '@/lib/date-range'
import type { Prisma } from '@/generated/prisma/client'
import type { Role } from '@/generated/prisma/enums'

const querySchema = z.object({
  brigadaId: z.string().optional(),
  inspetorId: z.string().optional(),
  dataInicio: z.string().date('dataInicio inválida').optional(),
  dataFim: z.string().date('dataFim inválida').optional(),
  incluirTerminados: z.enum(['0', '1']).optional(),
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
      incluirTerminados: searchParams.get('incluirTerminados') ?? undefined,
    })
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { brigadaId: requestedBrigadaId, inspetorId, dataInicio, dataFim, incluirTerminados } = parsed.data

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

    // Por defeito, estados terminais (Arquivado/Concluído) ficam fora do
    // total e de todas as repartições — são "trabalho fechado" e poluem a
    // análise de carga/distribuição. O checkbox "Incluir arquivados e
    // concluídos" da UI reativa-os. Os contadores `arquivados`/`ativos`
    // dentro de getInqueritoCounters sobrepõem `estado` com o seu próprio
    // filtro, por isso continuam corretos independentemente desta flag.
    // Intervalo inclusivo em dias UTC — o `lte` cobre o dia inteiro do fim.
    // (Antes usava-se `new Date(dataFim)` = meia-noite UTC, que excluía
    // silenciosamente tudo o que acontecesse no último dia do intervalo.)
    const dataAberturaRange = utcDayRangeFilter(dataInicio, dataFim)
    const where = {
      // Inquéritos soft-deleted não contam para estatística — alinhado com a
      // listagem /inqueritos (que filtra deletedAt: null). Sem isto, um
      // inquérito apagado aparecia nos contadores mas não na lista.
      deletedAt: null,
      ...(brigadaId && { brigadaId }),
      ...(inspetorId && { inspetorId }),
      ...(incluirTerminados !== '1' && { estado: { terminal: false } }),
      ...(dataAberturaRange && { dataAbertura: dataAberturaRange }),
    }

    // Âmbito "atual" (sem filtro de datas) para os contadores Aguarda Exames /
    // Enviados, que são estados do momento e não de um período.
    const currentScopeWhere: Prisma.InqueritoWhereInput = {
      deletedAt: null,
      ...(brigadaId && { brigadaId }),
      ...(inspetorId && { inspetorId }),
    }

    const [
      counters,
      porEstadoRaw,
      porBrigada,
      porInspetorRaw,
      porNatureza,
      vencidos,
      anoRaw,
      porTribunalRaw,
    ] = await Promise.all([
      // Os 8 contadores-resumo — partilhados com o Dashboard (chefe e superiores).
      getInqueritoCounters(where, currentScopeWhere),
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
      prisma.inquerito.count({
        where: {
          ...where,
          dataPrazo: { lt: new Date() },
          estado: { terminal: false },
        },
      }),
      prisma.inquerito.findMany({
        where,
        select: { dataAbertura: true, nuipc: true },
      }),
      prisma.inquerito.groupBy({ by: ['tribunalId'], where, _count: true, orderBy: { _count: { tribunalId: 'desc' } } }),
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
      const periodRange = utcDayRangeFilter(dataInicio, dataFim)
      const atividades = await prisma.atividade.findMany({
        where: {
          // Filtra por quem REGISTOU a atividade (utilizadorId), não pelo
          // inspetor titular do inquérito — para responder a "o que fez este
          // inspetor?" e coincidir com a página "Minha estatística" (/own).
          // Antes usava `inquerito: { inspetorId }`, que contava trabalho de
          // colaboradores nos inquéritos do inspetor e divergia da vista /own.
          utilizadorId: inspetorId,
          inquerito: { deletedAt: null },
          ...(periodRange ? { dataRealizacao: periodRange } : {}),
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

    // Year breakdown — use dataAbertura when available, otherwise extract
    // the 2-digit year from NUIPC (format: digits/YY.sequenceCOURT).
    function yearFromNuipc(nuipc: string): string {
      const m = /\/(\d{2})\./.exec(nuipc)
      if (!m) return '?'
      const yy = parseInt(m[1]!, 10)
      return String(yy <= 50 ? 2000 + yy : 1900 + yy)
    }
    const anoMap = new Map<string, number>()
    for (const inq of anoRaw) {
      const ano = inq.dataAbertura
        ? String(inq.dataAbertura.getFullYear())
        : yearFromNuipc(inq.nuipc)
      anoMap.set(ano, (anoMap.get(ano) ?? 0) + 1)
    }
    const porAno = Array.from(anoMap.entries())
      .map(([ano, count]) => ({ ano, count }))
      .sort((a, b) => a.ano.localeCompare(b.ano))

    // Enrich groupBy with related labels
    const inspetorIds = porInspetorRaw
      .map((r) => r.inspetorId)
      .filter((id): id is string => id !== null)
    const tribunalIds = porTribunalRaw
      .map((r) => r.tribunalId)
      .filter((id): id is string => id !== null)
    const [brigadas, estados, inspetores, tribunaisNomes] = await Promise.all([
      prisma.brigada.findMany({
        where: { id: { in: porBrigada.map((b) => b.brigadaId).filter((id): id is string => id !== null) } },
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
      tribunalIds.length
        ? prisma.tribunal.findMany({
            where: { id: { in: tribunalIds } },
            select: { id: true, nome: true, comarcaId: true },
          })
        : Promise.resolve([]),
    ])
    const brigadaNomes = Object.fromEntries(brigadas.map((b) => [b.id, b.nome]))
    const estadoById = new Map(estados.map((e) => [e.id, e]))
    const inspetorNomes = Object.fromEntries(inspetores.map((u) => [u.id, u.nome]))
    const tribunalNomesMap = Object.fromEntries(tribunaisNomes.map((t) => [t.id, t.nome]))

    const porComarca = await getComarcaBreakdown(porTribunalRaw)

    return Response.json({
      total: counters.total,
      cartaPrecatoriaCount: counters.cartaPrecatoria,
      ativos: counters.ativos,
      vencidos,
      semInspetor: counters.semInspetor,
      distribuido: counters.distribuido,
      aguardaExames: counters.aguardaExames,
      enviados: counters.enviados,
      arquivados: counters.arquivados,
      porAno,
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
        nome: (r.brigadaId ? brigadaNomes[r.brigadaId] : null) ?? r.brigadaId ?? '—',
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
      porComarca,
      porTribunal: porTribunalRaw
        .filter((r) => r.tribunalId !== null)
        .map((r) => ({
          tribunalId: r.tribunalId!,
          nome: tribunalNomesMap[r.tribunalId!] ?? '—',
          count: r._count,
        })),
      atividadesInspetor,
      atividadesInspetorTotal,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
