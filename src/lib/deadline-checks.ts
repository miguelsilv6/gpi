import { prisma } from '@/lib/prisma'
import {
  createNotification,
  notifyAtividadePrazo,
  escalateOverdueToChefes,
  escalateUrgentToChefes,
} from '@/lib/notifications'
import { checkIntercecoesATerminar } from '@/lib/intercecoes'
import { checkApreensoesParadas } from '@/lib/apreensoes'
import { checkPericiasAtrasadas } from '@/lib/pericias'

export interface DeadlineCheckSummary {
  approaching: number
  overdue: number
  urgent: number
  atividades: number
  controlos: number
  intercecoes: number
  apreensoes: number
  pericias: number
}

/**
 * Verificação central de prazos — a ÚNICA implementação, partilhada pelo worker
 * agendado (`cron.ts` → `runDeadlineCheck`) e pela rota manual/externa
 * `/api/cron/deadline-check`. Cobre tudo:
 *   1. prazos de inquéritos (+ escalada à hierarquia);
 *   2. prazos de ATIVIDADES (1.º/2.º aviso, por atividade);
 *   3. controlos periódicos (por realização);
 *   4. fim de linhas de interceção.
 *
 * Historicamente estes dois caminhos divergiram (as atividades só corriam na
 * rota; os controlos só no worker), pelo que os alertas de prazo de atividades
 * nunca disparavam no caminho agendado. Manter a lógica aqui, chamada por ambos,
 * garante paridade permanente.
 */
export async function runDeadlineChecks(now: Date = new Date()): Promise<DeadlineCheckSummary> {
  const config = await prisma.configuracaoSistema.findUnique({ where: { id: 'singleton' } })
  const alertDays = config?.prazoAlertaDias ?? 7

  const threshold = new Date(now)
  threshold.setDate(threshold.getDate() + alertDays)

  // ── 1. Prazos de inquéritos ────────────────────────────────────────────────
  const [approaching, overdue] = await Promise.all([
    prisma.inquerito.findMany({
      where: {
        dataPrazo: { gte: now, lte: threshold },
        estado: { terminal: false },
        inspetorId: { not: null },
      },
      include: { inspetor: { select: { id: true, email: true } } },
    }),
    prisma.inquerito.findMany({
      where: {
        dataPrazo: { lt: now },
        estado: { terminal: false },
        inspetorId: { not: null },
      },
      include: { inspetor: { select: { id: true, email: true } } },
    }),
  ])

  const jobs: Promise<unknown>[] = []

  for (const inq of approaching) {
    if (!inq.inspetorId || !inq.inspetor) continue
    jobs.push(
      createNotification({
        utilizadorId: inq.inspetorId,
        tipo: 'PRAZO_APROXIMANDO',
        titulo: `Prazo a aproximar — ${inq.nuipc}`,
        mensagem: `O prazo do inquérito ${inq.nuipc} vence em breve (${inq.dataPrazo?.toLocaleDateString('pt-PT')}).`,
        inqueritoid: inq.id,
        sendEmail: true,
        emailAddress: inq.inspetor.email,
      }),
    )
  }

  for (const inq of overdue) {
    if (!inq.inspetorId || !inq.inspetor) continue
    jobs.push(
      createNotification({
        utilizadorId: inq.inspetorId,
        tipo: 'PRAZO_ULTRAPASSADO',
        titulo: `Prazo ultrapassado — ${inq.nuipc}`,
        mensagem: `O prazo do inquérito ${inq.nuipc} foi ultrapassado.`,
        inqueritoid: inq.id,
        sendEmail: true,
        emailAddress: inq.inspetor.email,
      }),
    )
  }

  // Escalar os vencidos ao Inspetor-Chefe da brigada (para além do inspetor).
  jobs.push(escalateOverdueToChefes(overdue))

  // Limiar "urgente" opcional: prazos a aproximar-se ≤ urgentDays também são
  // escalados ao Inspetor-Chefe da brigada.
  const urgentDays = config?.prazoAlertaDiasUrgente ?? null
  let urgentCount = 0
  if (urgentDays != null) {
    const urgentThreshold = new Date(now)
    urgentThreshold.setDate(urgentThreshold.getDate() + urgentDays)
    const urgent = approaching.filter((inq) => inq.dataPrazo && inq.dataPrazo <= urgentThreshold)
    urgentCount = urgent.length
    jobs.push(escalateUrgentToChefes(urgent))
  }

  // ── 2. Prazos de atividades (1.º/2.º aviso, por atividade) ──────────────────
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const atividadesComPrazo = await prisma.atividade.findMany({
    where: {
      dataPrazo: { not: null, gte: today },
      concluidaEm: null,
      // Não enviar alertas de atividades cujo inquérito foi apagado (soft delete).
      inquerito: { deletedAt: null },
      OR: [
        { alertaDias1: { not: null }, alerta1Enviado: false },
        { alertaDias2: { not: null }, alerta2Enviado: false },
      ],
    },
    include: {
      inquerito: { select: { id: true, nuipc: true } },
      realizadaPor: { select: { id: true, email: true } },
    },
  })

  for (const atv of atividadesComPrazo) {
    if (!atv.dataPrazo) continue
    const prazoDay = new Date(atv.dataPrazo)
    prazoDay.setHours(0, 0, 0, 0)
    const diasRestantes = Math.round((prazoDay.getTime() - today.getTime()) / 86_400_000)

    if (atv.alertaDias1 != null && !atv.alerta1Enviado && diasRestantes <= atv.alertaDias1) {
      jobs.push(
        notifyAtividadePrazo({
          descricao: atv.descricao,
          inqueritoid: atv.inquerito.id,
          nuipc: atv.inquerito.nuipc,
          utilizadorId: atv.realizadaPor.id,
          diasRestantes,
          alertaNum: 1,
        }).then(() =>
          prisma.atividade.update({ where: { id: atv.id }, data: { alerta1Enviado: true } }),
        ),
      )
    }

    if (atv.alertaDias2 != null && !atv.alerta2Enviado && diasRestantes <= atv.alertaDias2) {
      jobs.push(
        notifyAtividadePrazo({
          descricao: atv.descricao,
          inqueritoid: atv.inquerito.id,
          nuipc: atv.inquerito.nuipc,
          utilizadorId: atv.realizadaPor.id,
          diasRestantes,
          alertaNum: 2,
        }).then(() =>
          prisma.atividade.update({ where: { id: atv.id }, data: { alerta2Enviado: true } }),
        ),
      )
    }
  }

  // ── 3. Controlos periódicos (por realização, com o alertaDias de cada) ──────
  // Cada controlo tem o seu próprio alertaDias; carregamos as realizações
  // pendentes não-alertadas (cap de 90 dias, o máximo permitido) e filtramos
  // em processo pelo limiar de cada controlo.
  const maxThreshold = new Date(now)
  maxThreshold.setDate(maxThreshold.getDate() + 90)

  const pendingRealizacoes = await prisma.controloRealizacao.findMany({
    where: {
      dataRealizacao: null,
      alertaEnviado: false,
      dataEsperada: { lte: maxThreshold },
      controlo: {
        concluidoEm: null,
        OR: [
          { inqueritoid: null },
          { inquerito: { deletedAt: null, estado: { terminal: false } } },
        ],
      },
    },
    include: {
      controlo: {
        include: {
          criador: { select: { id: true, email: true, nome: true } },
          inquerito: { select: { nuipc: true } },
        },
      },
    },
  })

  let controlosAlertas = 0
  for (const realizacao of pendingRealizacoes) {
    const { controlo } = realizacao
    const ctrlThreshold = new Date(today)
    ctrlThreshold.setDate(ctrlThreshold.getDate() + controlo.alertaDias)
    const dataEsperada =
      realizacao.dataEsperada instanceof Date
        ? realizacao.dataEsperada
        : new Date(realizacao.dataEsperada as string)
    if (dataEsperada > ctrlThreshold) continue
    controlosAlertas++
    const nuipcLabel = controlo.inquerito ? ` — ${controlo.inquerito.nuipc}` : ''
    jobs.push(
      createNotification({
        utilizadorId: controlo.criadorId,
        tipo: 'CONTROLO_APROXIMANDO',
        titulo: `${realizacao.numero}.º Controlo a aproximar${nuipcLabel}`,
        mensagem: `${controlo.descricao}: ${realizacao.numero}.º controlo previsto para ${dataEsperada.toLocaleDateString('pt-PT', { timeZone: 'UTC' })}.`,
        sendEmail: true,
        emailAddress: controlo.criador.email,
      }).then(() =>
        prisma.controloRealizacao.update({
          where: { id: realizacao.id },
          data: { alertaEnviado: true },
        }),
      ),
    )
  }

  await Promise.allSettled(jobs)

  // ── 4. Interceções: fim de linhas (aguarda internamente os envios) ──────────
  const intercecoes = await checkIntercecoesATerminar(now)

  // ── 5. Apreensões paradas (objetos há muito por dar destino) ────────────────
  const apreensoes = await checkApreensoesParadas(now)

  // ── 6. Perícias atrasadas (data prevista passou sem conclusão) ──────────────
  const pericias = await checkPericiasAtrasadas(now)

  return {
    approaching: approaching.length,
    overdue: overdue.length,
    urgent: urgentCount,
    atividades: atividadesComPrazo.length,
    controlos: controlosAlertas,
    intercecoes: intercecoes.alertas,
    apreensoes: apreensoes.alertas,
    pericias: pericias.alertas,
  }
}
