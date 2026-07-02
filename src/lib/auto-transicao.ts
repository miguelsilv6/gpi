/**
 * Transições automáticas de estado por inatividade.
 *
 * Regra (parametrizada pelo admin em `RegraTransicaoAutomatica`): um inquérito
 * que esteja no estado `origem` há mais de `meses` meses SEM qualquer atividade
 * nem mudança de estado nesse período é movido automaticamente para `destino`,
 * notificando o inspetor. Corre no cron (worker + endpoint /api/cron).
 *
 * A "referência de inatividade" de um inquérito é o MAIS RECENTE de:
 *   - quando entrou no estado atual (reconstruído do AuditLog);
 *   - a última atividade registada (criação, realização ou conclusão/devolução).
 * Se essa referência for mais antiga do que `meses` meses → transita.
 * Tomar o mais recente garante que uma atividade recente OU uma entrada recente
 * no estado impedem a transição (nunca arquiva algo com trabalho recente).
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { canTransition } from '@/lib/inquerito-state'
import { applyPolicy } from '@/lib/notifications'
import { childLogger } from '@/lib/logger'

const log = childLogger({ subsystem: 'auto-transicao' })

// Sentinela de sistema para o AuditLog (mesma convenção do backup/cron).
const SYSTEM_USER = '__system__'
// Teto de candidatos processados por regra/corrida — mantém a corrida limitada.
const CANDIDATE_CAP = 1000

/** Data-limite: instantes ANTES desta contam como "há mais de `meses` meses". */
export function cutoffDate(now: Date, meses: number): Date {
  const d = new Date(now)
  d.setMonth(d.getMonth() - meses)
  return d
}

/**
 * Referência de inatividade = o mais recente de (entrada no estado, última
 * atividade). `estadoDesde` é sempre conhecido (fallback = criação); a última
 * atividade pode ser null (inquérito sem atividades).
 */
export function inatividadeRef(estadoDesde: Date, ultimaAtividade: Date | null): Date {
  if (!ultimaAtividade) return estadoDesde
  return ultimaAtividade > estadoDesde ? ultimaAtividade : estadoDesde
}

/** Elegível quando a referência é anterior (ou igual) ao cutoff. */
export function isElegivel(ref: Date, cutoff: Date): boolean {
  return ref.getTime() <= cutoff.getTime()
}

interface RegraAtiva {
  id: string
  meses: number
  origem: { id: string; codigo: string; terminal: boolean }
  destino: { id: string; codigo: string; nome: string; terminal: boolean; ativo: boolean }
}

export interface AutoTransicaoResult {
  transitados: number
  porRegra: { regraId: string; origem: string; destino: string; transitados: number }[]
}

/**
 * Reconstrói, para um conjunto de inquéritos, quando cada um entrou no seu
 * estado ATUAL — a data da mudança de estado mais recente no AuditLog. Cobre
 * todas as fontes de mudança de estado, incluindo UPDATE/BULK_ASSIGN que só
 * contam quando alteraram mesmo o estado (via inspeção do JSON `detalhes`).
 * Devolve um mapa entidadeId → data. Ausência = sem mudança registada.
 */
async function estadoDesdeMap(ids: string[]): Promise<Map<string, Date>> {
  if (ids.length === 0) return new Map()
  const rows = await prisma.$queryRaw<{ entidadeId: string; at: Date }[]>`
    SELECT "entidadeId", MAX("createdAt") AS "at"
    FROM "AuditLog"
    WHERE "entidade" = 'Inquerito'
      AND "entidadeId" IN (${Prisma.join(ids)})
      AND (
        "acao" IN ('CREATE_INQUERITO', 'AUTO_TRANSITION_INQUERITO', 'REOPEN_INQUERITO', 'BULK_CHANGESTATE')
        OR ("acao" = 'UPDATE_INQUERITO'
            AND "detalhes" -> 'changed' @> '"estadoCodigo"'::jsonb)
        OR ("acao" = 'BULK_ASSIGN'
            AND ("detalhes" -> 'after' ->> 'estadoCodigo')
                IS DISTINCT FROM ("detalhes" -> 'before' ->> 'estadoCodigo'))
      )
    GROUP BY "entidadeId"
  `
  return new Map(rows.map((r) => [r.entidadeId, r.at]))
}

/** Última atividade (criação/realização/conclusão) por inquérito. */
async function ultimaAtividadeMap(ids: string[]): Promise<Map<string, Date>> {
  if (ids.length === 0) return new Map()
  const grouped = await prisma.atividade.groupBy({
    by: ['inqueritoid'],
    where: { inqueritoid: { in: ids } },
    _max: { dataRealizacao: true, createdAt: true, concluidaEm: true },
  })
  const map = new Map<string, Date>()
  for (const g of grouped) {
    const candidatos = [g._max.dataRealizacao, g._max.createdAt, g._max.concluidaEm].filter(
      (d): d is Date => d != null,
    )
    if (candidatos.length === 0) continue
    map.set(g.inqueritoid, new Date(Math.max(...candidatos.map((d) => d.getTime()))))
  }
  return map
}

/**
 * Corre todas as regras ativas e aplica as transições elegíveis. Idempotente
 * na prática: depois de transitado, o inquérito deixa o estado de origem, pelo
 * que uma segunda corrida não o volta a mexer.
 */
export async function runAutoTransicoes(now: Date = new Date()): Promise<AutoTransicaoResult> {
  const regras = (await prisma.regraTransicaoAutomatica.findMany({
    where: { ativa: true },
    select: {
      id: true,
      meses: true,
      origem: { select: { id: true, codigo: true, terminal: true } },
      destino: { select: { id: true, codigo: true, nome: true, terminal: true, ativo: true } },
    },
  })) as RegraAtiva[]

  const result: AutoTransicaoResult = { transitados: 0, porRegra: [] }
  // Notificações despachadas fora das transações e aguardadas no fim — a
  // corrida só termina quando todos os efeitos (incl. avisos) resolveram.
  const notifJobs: Promise<unknown>[] = []

  for (const regra of regras) {
    // Guardas de sanidade (a UI já valida, mas o estado pode ter mudado desde):
    // destino tem de estar ativo e a transição tem de ser válida na máquina de
    // estados (não-terminal → qualquer; nunca terminal → não-terminal).
    if (!regra.destino.ativo || !canTransition(regra.origem, regra.destino)) {
      log.warn({ regraId: regra.id }, 'Regra ignorada — destino inválido ou transição proibida')
      result.porRegra.push({
        regraId: regra.id,
        origem: regra.origem.codigo,
        destino: regra.destino.codigo,
        transitados: 0,
      })
      continue
    }

    const cutoff = cutoffDate(now, regra.meses)

    const candidatos = await prisma.inquerito.findMany({
      where: { deletedAt: null, estadoId: regra.origem.id },
      orderBy: { updatedAt: 'asc' },
      take: CANDIDATE_CAP,
      select: {
        id: true,
        nuipc: true,
        createdAt: true,
        inspetorId: true,
        inspetor: { select: { email: true } },
      },
    })
    if (candidatos.length === 0) {
      result.porRegra.push({ regraId: regra.id, origem: regra.origem.codigo, destino: regra.destino.codigo, transitados: 0 })
      continue
    }

    const ids = candidatos.map((c) => c.id)
    const [desde, ultima] = await Promise.all([estadoDesdeMap(ids), ultimaAtividadeMap(ids)])

    const elegiveis = candidatos.filter((c) => {
      const estadoDesde = desde.get(c.id) ?? c.createdAt
      const ref = inatividadeRef(estadoDesde, ultima.get(c.id) ?? null)
      return isElegivel(ref, cutoff)
    })

    let transitadosRegra = 0
    for (const inq of elegiveis) {
      try {
        await prisma.$transaction(async (tx) => {
          // Re-verifica dentro da transação que ainda está no estado de origem
          // (evita corrida com uma alteração manual concorrente).
          const atual = await tx.inquerito.findUnique({
            where: { id: inq.id },
            select: { estadoId: true },
          })
          if (!atual || atual.estadoId !== regra.origem.id) return

          await tx.inquerito.update({
            where: { id: inq.id },
            data: {
              estadoId: regra.destino.id,
              ...(regra.destino.terminal && { dataConclusao: now }),
            },
          })
          await tx.auditLog.create({
            data: {
              acao: 'AUTO_TRANSITION_INQUERITO',
              entidade: 'Inquerito',
              entidadeId: inq.id,
              utilizadorId: SYSTEM_USER,
              detalhes: {
                origem: 'regra_inatividade',
                regraId: regra.id,
                meses: regra.meses,
                estadoAnterior: regra.origem.codigo,
                estadoNovo: regra.destino.codigo,
                dataConclusaoSet: regra.destino.terminal ? now.toISOString() : null,
              } as never,
            },
          })
          transitadosRegra++
        })
      } catch (err) {
        log.error({ err, inqueritoid: inq.id }, 'Falha ao aplicar transição automática')
        continue
      }

      // Notificação fora da transação — o inspetor é o destinatário natural;
      // os ccRoles da policy tratam do resto. Recolhida para aguardar no fim.
      if (inq.inspetorId) {
        notifJobs.push(
          applyPolicy({
            tipo: 'TRANSICAO_AUTOMATICA',
            titulo: `Transição automática — ${inq.nuipc}`,
            mensagem: `O inquérito ${inq.nuipc} passou automaticamente de «${regra.origem.codigo}» para «${regra.destino.nome}» por inatividade superior a ${regra.meses} ${regra.meses === 1 ? 'mês' : 'meses'}.`,
            inqueritoid: inq.id,
            naturalUserId: inq.inspetorId,
          }).catch((err) => log.error({ err, inqueritoid: inq.id }, 'Falha ao notificar transição automática')),
        )
      }
    }

    result.transitados += transitadosRegra
    result.porRegra.push({
      regraId: regra.id,
      origem: regra.origem.codigo,
      destino: regra.destino.codigo,
      transitados: transitadosRegra,
    })
  }

  await Promise.allSettled(notifJobs)

  if (result.transitados > 0) {
    log.info({ transitados: result.transitados, porRegra: result.porRegra }, 'Transições automáticas aplicadas')
  }
  return result
}
