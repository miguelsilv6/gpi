import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { getComarcaBreakdown } from '@/lib/estatisticas-counters'
import type { Role } from '@/generated/prisma/enums'

const querySchema = z.object({
  dataInicio: z.string().date('dataInicio inválida').optional(),
  dataFim: z.string().date('dataFim inválida').optional(),
  incluirTerminados: z.enum(['0', '1']).optional(),
})

// Estatísticas pessoais do INSPETOR — sempre filtradas pelo utilizador da sessão.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role

    if (!hasPermission(role, 'estatistica:own')) {
      return apiError('Sem permissão para ver as suas estatísticas', 403)
    }

    const { searchParams } = new URL(req.url)
    const parsed = querySchema.safeParse({
      dataInicio: searchParams.get('dataInicio') ?? undefined,
      dataFim: searchParams.get('dataFim') ?? undefined,
      incluirTerminados: searchParams.get('incluirTerminados') ?? undefined,
    })
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { dataInicio, dataFim, incluirTerminados } = parsed.data
    const inspetorId = session.user.id

    // Base scope sem filtro de data — usada pelos contadores "actuais"
    // (Aguarda Exames / Enviados), que refletem o estado presente e não um
    // período (alinhado com /api/estatisticas).
    const scopeWhere = {
      deletedAt: null,
      inspetorId,
    }
    // Por defeito exclui estados terminais (Arquivado/Concluído) do total e
    // das repartições — o checkbox "Incluir arquivados e concluídos" da UI
    // reativa-os. `arquivados`/`concluidos` abaixo sobrepõem `estado` com o
    // seu próprio filtro, por isso continuam corretos independentemente
    // desta flag.
    const where = {
      ...scopeWhere,
      ...(incluirTerminados !== '1' && { estado: { terminal: false } }),
      ...(dataInicio || dataFim
        ? {
            dataAbertura: {
              ...(dataInicio && { gte: new Date(`${dataInicio}T00:00:00.000Z`) }),
              ...(dataFim && { lte: new Date(`${dataFim}T23:59:59.999Z`) }),
            },
          }
        : {}),
    }

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
      porNatureza,
      porTribunalRaw,
      total,
      vencidos,
      cartasPrecatorias,
      aguardaExames,
      enviados,
      arquivados,
      concluidos,
      anoRaw,
    ] = await Promise.all([
      prisma.inquerito.groupBy({ by: ['estadoId'], where, _count: true }),
      prisma.inquerito.groupBy({
        by: ['natureza'],
        where,
        _count: true,
        orderBy: { _count: { natureza: 'desc' } },
        take: 10,
      }),
      prisma.inquerito.groupBy({ by: ['tribunalId'], where, _count: true }),
      prisma.inquerito.count({ where }),
      prisma.inquerito.count({
        where: { ...where, dataPrazo: { lt: new Date() }, estado: { terminal: false } },
      }),
      prisma.inquerito.count({ where: { ...where, cartaPrecatoria: true } }),
      nomesAguardaExames.length === 0
        ? Promise.resolve(0)
        : prisma.inquerito.count({
            where: {
              ...scopeWhere,
              estado: { terminal: false },
              atividades: { some: { descricao: { in: nomesAguardaExames }, concluidaEm: null } },
            },
          }),
      nomesEnviados.length === 0
        ? Promise.resolve(0)
        : prisma.inquerito.count({
            where: {
              ...scopeWhere,
              estado: { terminal: false },
              atividades: { some: { descricao: { in: nomesEnviados }, concluidaEm: null } },
            },
          }),
      prisma.inquerito.count({ where: { ...where, estado: { codigo: 'ARQUIVADO' } } }),
      prisma.inquerito.count({ where: { ...where, estado: { codigo: 'CONCLUIDO' } } }),
      prisma.inquerito.findMany({ where, select: { dataAbertura: true, nuipc: true } }),
    ])

    // Atividades registadas pelo próprio inspetor no período selecionado.
    // Filtra por utilizadorId (quem registou) e não apenas por inquerito.inspetorId,
    // para não contar trabalho registado por outros em inquéritos do inspetor.
    const periodWhere = {
      ...(dataInicio && { gte: new Date(`${dataInicio}T00:00:00.000Z`) }),
      ...(dataFim && { lte: new Date(`${dataFim}T23:59:59.999Z`) }),
    }
    const atividades = await prisma.atividade.findMany({
      where: {
        utilizadorId: inspetorId,
        inquerito: { deletedAt: null },
        ...(dataInicio || dataFim ? { dataRealizacao: periodWhere } : {}),
      },
      select: { descricao: true, quantidade: true },
    })

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
    const atividadesInspetor = Array.from(acc.entries())
      .map(([descricao, v]) => ({
        descricao,
        count: v.count,
        sumQuantidade: v.sumQ,
        temQuantidade: v.temQ,
      }))
      .sort((a, b) => b.count - a.count)

    // Ano de abertura (do NUIPC quando dataAbertura não está preenchido).
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

    const estados = await prisma.estadoInquerito.findMany({
      where: { id: { in: porEstadoRaw.map((e) => e.estadoId) } },
      select: { id: true, codigo: true, nome: true, cor: true },
    })
    const estadoById = new Map(estados.map((e) => [e.id, e]))

    const porComarca = await getComarcaBreakdown(porTribunalRaw)

    return Response.json({
      total,
      vencidos,
      cartasPrecatorias,
      aguardaExames,
      enviados,
      arquivados,
      concluidos,
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
      porNatureza: porNatureza.map((r) => ({ natureza: r.natureza, count: r._count })),
      porComarca,
      atividadesInspetor,
      atividadesInspetorTotal: atividades.length,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
