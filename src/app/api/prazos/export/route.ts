import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError, buildAtividadePrazoWhere, buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { isModuloIntercecoesAtivo } from '@/lib/intercecoes-module'
import { TIPO_LINHA_LABEL } from '@/lib/validations/intercecao'
import { buildCsv, csvResponse, CSV_EXPORT_LIMIT } from '@/lib/csv'
import type { Role, TipoLinhaIntercecao } from '@/generated/prisma/enums'

function startOfDayLocal(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

// Exportação CSV do painel "Prazos" (/prazos) com os mesmos filtros de estado
// (todos/vencidos/próximos) e histórico, mas sem paginação nem calendário.
// Mesmo scope da página: atividades com prazo via buildAtividadePrazoWhere e
// fim das linhas intercetadas via scope do inquérito (só pendentes).
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    const userId = session.user.id
    if (!hasPermission(role, 'prazo:read:own') || !hasPermission(role, 'inquerito:export')) {
      return apiError('Sem permissão para exportar prazos', 403)
    }

    const sp = req.nextUrl.searchParams
    const s = sp.get('status')
    const status = s === 'vencidos' || s === 'proximos' ? s : 'todos'
    const historico = sp.get('historico') === '1'

    const config = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: { prazoAlertaDias: true },
    })
    const alertaDias = config?.prazoAlertaDias ?? 7
    const now = new Date()
    const limitProximos = new Date(now)
    limitProximos.setDate(limitProximos.getDate() + alertaDias)

    const statusWhere =
      status === 'vencidos'
        ? { dataPrazo: { lt: now } }
        : status === 'proximos'
          ? { dataPrazo: { gte: now, lte: limitProximos } }
          : {}

    const atividadesPromise = prisma.atividade.findMany({
      where: {
        AND: [
          { dataPrazo: { not: null } },
          historico ? { concluidaEm: { not: null } } : { concluidaEm: null },
          historico
            ? { inquerito: { deletedAt: null } }
            : { inquerito: { deletedAt: null, estado: { terminal: false } } },
          buildAtividadePrazoWhere(role, userId, session.user.brigadaId),
          statusWhere,
        ],
      },
      orderBy: historico ? { concluidaEm: 'desc' } : { dataPrazo: 'asc' },
      take: CSV_EXPORT_LIMIT + 1,
      select: {
        descricao: true,
        dataPrazo: true,
        concluidaEm: true,
        realizadaPor: { select: { nome: true } },
        inquerito: { select: { nuipc: true } },
      },
    })

    const comIntercecoes = !historico && (await isModuloIntercecoesAtivo(role))
    const linhasPromise = comIntercecoes
      ? prisma.intercecaoLinha.findMany({
          where: {
            dataFim:
              status === 'vencidos'
                ? { lt: now }
                : status === 'proximos'
                  ? { gte: now, lte: limitProximos }
                  : { gte: startOfDayLocal(now) },
            alvo: {
              inquerito: {
                AND: [
                  { deletedAt: null, estado: { terminal: false } },
                  buildInqueritoWhere(role, userId, session.user.brigadaId ?? null),
                ],
              },
            },
          },
          orderBy: [{ dataFim: 'asc' }, { id: 'asc' }],
          take: CSV_EXPORT_LIMIT + 1,
          select: {
            codigo: true,
            tipo: true,
            identificador: true,
            dataFim: true,
            alvo: {
              select: {
                nome: true,
                inquerito: { select: { nuipc: true, inspetor: { select: { nome: true } } } },
              },
            },
          },
        })
      : Promise.resolve([])

    const [atividades, linhas] = await Promise.all([atividadesPromise, linhasPromise])
    const linhasCsv = [
      ...atividades.map((a) => ({
        nuipc: a.inquerito.nuipc,
        origem: 'Atividade',
        descricao: a.descricao,
        prazo: a.dataPrazo!,
        concluida: a.concluidaEm,
        responsavel: a.realizadaPor.nome,
      })),
      ...linhas.map((l) => ({
        nuipc: l.alvo.inquerito.nuipc,
        origem: 'Interceção',
        descricao: `Fim de interceção: ${TIPO_LINHA_LABEL[l.tipo as TipoLinhaIntercecao]} ${l.identificador} (alvo «${l.alvo.nome}», código ${l.codigo})`,
        prazo: l.dataFim,
        concluida: null,
        responsavel: l.alvo.inquerito.inspetor?.nome ?? '',
      })),
    ]
    if (linhasCsv.length > CSV_EXPORT_LIMIT) {
      return apiError(`Limite de ${CSV_EXPORT_LIMIT} registos por exportação. Refine os filtros.`, 413)
    }
    if (!historico) linhasCsv.sort((a, b) => a.prazo.getTime() - b.prazo.getTime())

    await writeAudit({
      req,
      acao: 'EXPORT_PRAZOS',
      entidade: 'Atividade',
      entidadeId: '__bulk_export__',
      utilizadorId: userId,
      detalhes: { filtros: { status, historico }, quantidade: linhasCsv.length },
    })

    const csv = buildCsv(
      ['NUIPC', 'Origem', 'Descrição', 'Prazo', 'Concluída em', 'Responsável'],
      linhasCsv.map((r) => [r.nuipc, r.origem, r.descricao, r.prazo, r.concluida, r.responsavel]),
    )
    return csvResponse(historico ? 'prazos-historico' : 'prazos', csv)
  } catch (error) {
    return handleApiError(error)
  }
}
