/**
 * Validações quinzenais das interceções (art. 188.º CPP) — o calendário que no
 * controlo em papel vive na folha "Registos": uma lista numerada de datas, de
 * 14 em 14 dias, em que os suportes são apresentados, e na qual se assinala a
 * validação que serve para preparar a renovação de cada linha.
 *
 * O plano é do INQUÉRITO (não do alvo): a lista é única e cobre todas as
 * linhas, tal como no ficheiro que substitui.
 *
 * As datas são derivadas do plano e re-sincronizadas sempre que as linhas
 * mudam (`sincronizarValidacoes`); uma validação já marcada como feita nunca é
 * apagada, para não perder o registo de quem apresentou o quê.
 *
 * Os alertas seguem o padrão das linhas em `intercecoes.ts`: query limitada aos
 * flags por enviar, filtro fino em processo, notificação via `applyPolicy` e
 * marcação idempotente do flag no `.then()`.
 */
import { prisma } from '@/lib/prisma'
import { applyPolicy } from '@/lib/notifications'
import { diasRestantes } from '@/lib/prazos'
import { childLogger } from '@/lib/logger'
import {
  datasValidacoes,
  diaUTC,
  numeroValidacaoRenovacao,
  TIPO_LINHA_LABEL,
  INTERCECAO_VALIDACAO_INTERVALO_DEFAULT,
} from '@/lib/validations/intercecao'
import type { TipoLinhaIntercecao } from '@/generated/prisma/enums'

const log = childLogger({ subsystem: 'intercecoes-validacoes' })

export const VALIDACAO_SELECT = {
  id: true,
  numero: true,
  data: true,
  feitaEm: true,
  observacoes: true,
  feitaPor: { select: { id: true, nome: true } },
} as const

/** Plano + validações ordenadas de um inquérito (null se ainda não há plano). */
export async function getPlanoValidacoes(inqueritoId: string) {
  return prisma.intercecaoPlanoValidacao.findUnique({
    where: { inqueritoid: inqueritoId },
    select: {
      id: true,
      dataPrimeira: true,
      intervaloDias: true,
      alertaDias: true,
      validacoes: { orderBy: { numero: 'asc' }, select: VALIDACAO_SELECT },
    },
  })
}

/**
 * Cria o plano com a cadência por omissão na primeira vez que faz falta.
 * `dataPrimeira` é a data que o inspetor indicou para a 1.ª apresentação.
 */
export async function criarPlanoSeNecessario(
  inqueritoId: string,
  dataPrimeira: Date,
): Promise<string> {
  const existente = await prisma.intercecaoPlanoValidacao.findUnique({
    where: { inqueritoid: inqueritoId },
    select: { id: true },
  })
  if (existente) return existente.id
  const criado = await prisma.intercecaoPlanoValidacao.create({
    data: {
      inqueritoid: inqueritoId,
      dataPrimeira,
      intervaloDias: INTERCECAO_VALIDACAO_INTERVALO_DEFAULT,
    },
    select: { id: true },
  })
  return criado.id
}

/**
 * Regenera as validações de um inquérito a partir do plano e das linhas.
 *
 * - Horizonte = data de fim mais tardia das linhas (ou a 1.ª validação, se não
 *   houver linhas). `datasValidacoes` acrescenta sempre uma para lá do
 *   horizonte, que é onde cai a renovação da última linha.
 * - Datas que mudaram (porque o plano mudou) são atualizadas e os flags de
 *   aviso repostos — como em `resetAlertFlagsOnUpdate` para as linhas, adiar
 *   uma validação tem de voltar a alertar.
 * - Validações a mais são apagadas, EXCETO as já marcadas como feitas.
 *
 * Idempotente: correr duas vezes seguidas não muda nada.
 */
export async function sincronizarValidacoes(inqueritoId: string): Promise<{ total: number }> {
  const plano = await prisma.intercecaoPlanoValidacao.findUnique({
    where: { inqueritoid: inqueritoId },
    select: { id: true, dataPrimeira: true, intervaloDias: true },
  })
  if (!plano) return { total: 0 }

  const ultimaLinha = await prisma.intercecaoLinha.findFirst({
    where: { alvo: { inqueritoid: inqueritoId } },
    orderBy: { dataFim: 'desc' },
    select: { dataFim: true },
  })
  const horizonte = ultimaLinha?.dataFim ?? plano.dataPrimeira
  const datas = datasValidacoes(plano.dataPrimeira, plano.intervaloDias, horizonte)

  const existentes = await prisma.intercecaoValidacao.findMany({
    where: { planoId: plano.id },
    select: { id: true, numero: true, data: true, feitaEm: true },
  })
  const porNumero = new Map(existentes.map((v) => [v.numero, v]))

  const ops: Promise<unknown>[] = []

  datas.forEach((data, i) => {
    const numero = i + 1
    const atual = porNumero.get(numero)
    if (!atual) {
      // `upsert` e não `create`: duas edições em simultâneo (ex.: renovar duas
      // linhas ao mesmo tempo) sincronizam ambas e chocariam no @@unique — o
      // que faria 500 numa rota cuja alteração principal já foi guardada.
      ops.push(
        prisma.intercecaoValidacao.upsert({
          where: { planoId_numero: { planoId: plano.id, numero } },
          create: { planoId: plano.id, numero, data },
          update: {}, // já criada por outra corrida — nada a corrigir
        }),
      )
    } else if (diaUTC(atual.data) !== diaUTC(data)) {
      ops.push(
        prisma.intercecaoValidacao.update({
          where: { id: atual.id },
          data: { data, alertaEnviado: false, alertaRenovacaoEnviado: false },
        }),
      )
    }
  })

  // Excedentes (o horizonte encolheu, ex.: linha apagada) — as feitas ficam.
  const aApagar = existentes
    .filter((v) => v.numero > datas.length && v.feitaEm === null)
    .map((v) => v.id)
  if (aApagar.length > 0) {
    ops.push(prisma.intercecaoValidacao.deleteMany({ where: { id: { in: aApagar } } }))
  }

  await Promise.all(ops)
  return { total: Math.max(datas.length, existentes.filter((v) => v.feitaEm !== null).length) }
}

/**
 * Alertas de validação: um aviso `alertaDias` antes de cada data por cumprir e,
 * na validação que antecede o fim de uma linha, um segundo aviso a lembrar que
 * é ali que a renovação tem de ser preparada.
 *
 * Só olha para validações por fazer (`feitaEm` null) e ignora inquéritos
 * soft-deleted — o prazo é legal e independente do estado do inquérito.
 */
export async function checkValidacoesIntercecoes(
  now: Date = new Date(),
): Promise<{ alertas: number }> {
  // Cap da query: nenhum aviso dista mais de 365 dias (limite do alertaDias).
  const maxThreshold = new Date(now)
  maxThreshold.setDate(maxThreshold.getDate() + 365)

  const validacoes = await prisma.intercecaoValidacao.findMany({
    where: {
      feitaEm: null,
      data: { lte: maxThreshold },
      OR: [{ alertaEnviado: false }, { alertaRenovacaoEnviado: false }],
      plano: { inquerito: { deletedAt: null } },
    },
    select: {
      id: true,
      numero: true,
      data: true,
      alertaEnviado: true,
      alertaRenovacaoEnviado: true,
      plano: {
        select: {
          alertaDias: true,
          dataPrimeira: true,
          intervaloDias: true,
          inquerito: {
            select: {
              id: true,
              nuipc: true,
              inspetorId: true,
              intercecaoAlvos: {
                select: {
                  nome: true,
                  linhas: {
                    select: { id: true, codigo: true, tipo: true, identificador: true, dataFim: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  const jobs: Promise<unknown>[] = []
  let alertas = 0

  for (const v of validacoes) {
    const { alertaDias, dataPrimeira, intervaloDias, inquerito } = v.plano
    const dias = diasRestantes(v.data, now)
    if (dias > alertaDias) continue

    const quando =
      dias < 0
        ? `estava marcada para ${formatData(v.data)}`
        : dias === 0
          ? 'é hoje'
          : `é a ${formatData(v.data)} (${dias} ${dias === 1 ? 'dia' : 'dias'})`

    if (!v.alertaEnviado) {
      alertas++
      jobs.push(
        applyPolicy({
          tipo: 'INTERCECAO_VALIDACAO_APROXIMA',
          titulo: `${v.numero}.ª Validação de interceções — ${inquerito.nuipc}`,
          mensagem: `A ${v.numero}.ª validação quinzenal das interceções ${quando}.`,
          inqueritoid: inquerito.id,
          naturalUserId: inquerito.inspetorId ?? null,
        })
          .then(() =>
            prisma.intercecaoValidacao.update({
              where: { id: v.id },
              data: { alertaEnviado: true },
            }),
          )
          .catch((err) => log.error({ err, validacaoId: v.id }, 'Falha ao notificar validação')),
      )
    }

    // Renovações: linhas cujo fim é preparado NESTA validação. A lista completa
    // de validações vem do plano, mas para decidir basta comparar com as datas
    // geradas — aqui usa-se o atalho de ter já a validação em mãos.
    if (!v.alertaRenovacaoEnviado) {
      const linhasARenovar = inquerito.intercecaoAlvos.flatMap((alvo) =>
        alvo.linhas
          .filter(
            (l) => numeroValidacaoRenovacao(dataPrimeira, intervaloDias, l.dataFim) === v.numero,
          )
          .map((l) => ({ ...l, alvoNome: alvo.nome })),
      )
      if (linhasARenovar.length > 0) {
        alertas++
        const descricao = linhasARenovar
          .map(
            (l) =>
              `${TIPO_LINHA_LABEL[l.tipo as TipoLinhaIntercecao]} ${l.identificador} (alvo «${l.alvoNome}», código ${l.codigo}) termina a ${formatData(l.dataFim)}`,
          )
          .join('; ')
        jobs.push(
          applyPolicy({
            tipo: 'INTERCECAO_RENOVACAO_PREPARAR',
            titulo: `Renovação a preparar na ${v.numero}.ª validação — ${inquerito.nuipc}`,
            mensagem: `A ${v.numero}.ª validação ${quando} e é a última antes do fim de ${linhasARenovar.length === 1 ? 'uma interceção' : `${linhasARenovar.length} interceções`}: ${descricao}.`,
            inqueritoid: inquerito.id,
            naturalUserId: inquerito.inspetorId ?? null,
          })
            .then(() =>
              prisma.intercecaoValidacao.update({
                where: { id: v.id },
                data: { alertaRenovacaoEnviado: true },
              }),
            )
            .catch((err) =>
              log.error({ err, validacaoId: v.id }, 'Falha ao notificar renovação a preparar'),
            ),
        )
      }
    }
  }

  await Promise.allSettled(jobs)
  if (alertas > 0) log.info({ alertas }, 'Alertas de validação de interceções enviados')
  return { alertas }
}

function formatData(d: Date): string {
  return new Date(d).toLocaleDateString('pt-PT', { timeZone: 'UTC' })
}
