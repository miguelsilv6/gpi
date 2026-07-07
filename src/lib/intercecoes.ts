/**
 * Interceções de comunicações (escutas) — seleções partilhadas, lista global
 * com scope RBAC e o motor de alertas de fim de linha.
 *
 * Os alertas seguem o padrão dos Controlos em `runDeadlineCheck` (cron.ts):
 * query limitada (flags por enviar + cap de data), filtro fino em processo com
 * os dias por linha, notificação via `applyPolicy` e marcação idempotente do
 * flag no `.then()`. Ao contrário do padrão antigo, editar a data de fim (ou
 * os dias de alerta) REPÕE os flags — ver rota PUT da linha.
 */
import { prisma } from '@/lib/prisma'
import { applyPolicy } from '@/lib/notifications'
import { buildInqueritoWhere } from '@/lib/role-scope'
import { alertasDevidos, TIPO_LINHA_LABEL } from '@/lib/validations/intercecao'
import { diasRestantes } from '@/lib/prazos'
import { childLogger } from '@/lib/logger'
import type { Role, TipoLinhaIntercecao } from '@/generated/prisma/enums'

const log = childLogger({ subsystem: 'intercecoes' })

// ── Seleções/tipos partilhados (página por inquérito) ────────────────────────

export const INTERCECAO_LINHA_SELECT = {
  id: true,
  codigo: true,
  tipo: true,
  identificador: true,
  rede: true,
  dataInicio: true,
  dataFim: true,
  alertaDias1: true,
  alertaDias2: true,
  renovacoes: true,
  observacoes: true,
} as const

/** Árvore de alvos com linhas (ordenadas por fim) e contagem de produtos. */
export async function getIntercecoesTree(inqueritoId: string) {
  return prisma.intercecaoAlvo.findMany({
    where: { inqueritoid: inqueritoId },
    orderBy: { nome: 'asc' },
    select: {
      id: true,
      nome: true,
      observacoes: true,
      notas: true,
      acompanhamento: true,
      linhas: { orderBy: { dataFim: 'asc' }, select: INTERCECAO_LINHA_SELECT },
      _count: { select: { produtos: true } },
    },
  })
}

export type IntercecaoAlvoTree = Awaited<ReturnType<typeof getIntercecoesTree>>[number]

/** Resumo leve para o card no detalhe do inquérito. */
export async function getIntercecoesResumo(inqueritoId: string, now: Date = new Date()) {
  const inicioHoje = new Date(now)
  inicioHoje.setHours(0, 0, 0, 0)
  const [alvos, linhasAtivas, proxima] = await Promise.all([
    prisma.intercecaoAlvo.count({ where: { inqueritoid: inqueritoId } }),
    prisma.intercecaoLinha.count({
      where: { alvo: { inqueritoid: inqueritoId }, dataFim: { gte: inicioHoje } },
    }),
    prisma.intercecaoLinha.findFirst({
      where: { alvo: { inqueritoid: inqueritoId }, dataFim: { gte: inicioHoje } },
      orderBy: { dataFim: 'asc' },
      select: { dataFim: true, alertaDias1: true },
    }),
  ])
  return { alvos, linhasAtivas, proximoFim: proxima?.dataFim ?? null, proximoAlertaDias: proxima?.alertaDias1 ?? null }
}

// ── Lista global (/intercecoes) ──────────────────────────────────────────────

export type EstadoFiltro = 'ativas' | 'a-expirar' | 'todas'

/**
 * Janela do filtro "a expirar". Fixa (= default do 1.º aviso): o SQL não
 * consegue comparar `dataFim` com o `alertaDias1` de cada linha; os alertas
 * reais continuam a usar os dias por linha.
 */
export const A_EXPIRAR_DIAS = 10

export async function getLinhasGlobal(opts: {
  role: Role
  userId: string
  brigadaId: string | null
  estado: EstadoFiltro
  page: number
  pageSize?: number
  now?: Date
}) {
  const { role, userId, brigadaId, estado, page } = opts
  const pageSize = opts.pageSize ?? 50
  const now = opts.now ?? new Date()
  const inicioHoje = new Date(now)
  inicioHoje.setHours(0, 0, 0, 0)

  const fimJanela = new Date(inicioHoje)
  fimJanela.setDate(fimJanela.getDate() + A_EXPIRAR_DIAS)
  fimJanela.setHours(23, 59, 59, 999)

  const where = {
    alvo: {
      inquerito: {
        deletedAt: null,
        AND: [buildInqueritoWhere(role, userId, brigadaId)],
      },
    },
    ...(estado === 'ativas' && { dataFim: { gte: inicioHoje } }),
    ...(estado === 'a-expirar' && { dataFim: { gte: inicioHoje, lte: fimJanela } }),
  }

  const [items, total] = await Promise.all([
    prisma.intercecaoLinha.findMany({
      where,
      orderBy: [{ dataFim: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        ...INTERCECAO_LINHA_SELECT,
        alvo: {
          select: {
            id: true,
            nome: true,
            inquerito: { select: { nuipc: true, inspetor: { select: { nome: true } } } },
          },
        },
      },
    }),
    prisma.intercecaoLinha.count({ where }),
  ])
  return { items, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}

// ── Motor de alertas (chamado pelo worker e pela rota /api/cron) ─────────────

/**
 * Percorre as linhas com avisos por enviar e notifica o inspetor do inquérito
 * (policy `INTERCECAO_A_TERMINAR` trata de cc/email). Idempotente: cada aviso
 * marca o seu flag após envio; linhas já vencidas sem aviso disparam uma vez.
 * Ignora apenas inquéritos soft-deleted — o fim da interceção é um prazo legal
 * independente do estado do inquérito.
 */
export async function checkIntercecoesATerminar(now: Date = new Date()): Promise<{ alertas: number }> {
  // Cap da query: nenhum aviso dista mais de 365 dias (limite do alertaDias).
  const maxThreshold = new Date(now)
  maxThreshold.setDate(maxThreshold.getDate() + 365)

  const linhas = await prisma.intercecaoLinha.findMany({
    where: {
      OR: [
        { alertaDias1: { not: null }, alerta1Enviado: false },
        { alertaDias2: { not: null }, alerta2Enviado: false },
      ],
      dataFim: { lte: maxThreshold },
      alvo: { inquerito: { deletedAt: null } },
    },
    select: {
      id: true,
      codigo: true,
      tipo: true,
      identificador: true,
      dataFim: true,
      alertaDias1: true,
      alertaDias2: true,
      alerta1Enviado: true,
      alerta2Enviado: true,
      alvo: {
        select: {
          nome: true,
          inquerito: { select: { id: true, nuipc: true, inspetorId: true } },
        },
      },
    },
  })

  const jobs: Promise<unknown>[] = []
  let alertas = 0

  for (const linha of linhas) {
    const devidos = alertasDevidos(linha, now)
    if (devidos.length === 0) continue

    const { inquerito } = linha.alvo
    const dias = diasRestantes(linha.dataFim, now)
    const quando =
      dias < 0
        ? `terminou a ${formatData(linha.dataFim)}`
        : dias === 0
          ? 'termina hoje'
          : `termina a ${formatData(linha.dataFim)} (${dias} ${dias === 1 ? 'dia' : 'dias'})`

    for (const n of devidos) {
      alertas++
      jobs.push(
        applyPolicy({
          tipo: 'INTERCECAO_A_TERMINAR',
          titulo: `Interceção a terminar — ${inquerito.nuipc}`,
          mensagem: `A interceção ${TIPO_LINHA_LABEL[linha.tipo as TipoLinhaIntercecao]} ${linha.identificador} (alvo «${linha.alvo.nome}», código ${linha.codigo}) ${quando}. ${n}.º aviso.`,
          inqueritoid: inquerito.id,
          naturalUserId: inquerito.inspetorId ?? null,
        })
          .then(() =>
            prisma.intercecaoLinha.update({
              where: { id: linha.id },
              data: n === 1 ? { alerta1Enviado: true } : { alerta2Enviado: true },
            }),
          )
          .catch((err) =>
            log.error({ err, linhaId: linha.id, aviso: n }, 'Falha ao notificar fim de interceção'),
          ),
      )
    }
  }

  await Promise.allSettled(jobs)
  if (alertas > 0) log.info({ alertas }, 'Alertas de fim de interceção enviados')
  return { alertas }
}

function formatData(d: Date): string {
  return new Date(d).toLocaleDateString('pt-PT', { timeZone: 'UTC' })
}
