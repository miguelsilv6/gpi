/**
 * "O meu dia" — bloco de arranque do dashboard com o que precisa de atenção:
 *
 *   - eventos de hoje e de amanhã (reutiliza getAgendaEvents: prazos de
 *     inquérito, atividades com prazo, controlos e diligências, cada fonte
 *     com o seu âmbito por role — a mesma semântica da Agenda/Prazos);
 *   - contagens de atrasados (prazos vencidos, atividades e controlos em
 *     atraso), com os mesmos âmbitos;
 *   - tarefas pessoais em aberto (sempre do próprio utilizador).
 */
import { prisma } from '@/lib/prisma'
import {
  buildInqueritoWhere,
  buildAtividadePrazoWhere,
  buildControloWhere,
} from '@/lib/role-scope'
import { getAgendaEvents, type AgendaEvent } from '@/lib/agenda'
import { nuipcToSlug } from '@/lib/utils'
import type { PrioridadeTarefa, Role } from '@/generated/prisma/enums'

export interface MeuDiaTarefa {
  id: string
  titulo: string
  prioridade: PrioridadeTarefa
  nuipc: string
  slug: string
}

export interface MeuDiaData {
  hoje: AgendaEvent[]
  amanha: AgendaEvent[]
  atrasados: { prazos: number; atividades: number; controlos: number }
  tarefas: MeuDiaTarefa[]
  tarefasTotal: number
}

const TAREFAS_LIMIT = 5

/** Meia-noite local do dia de `now`. */
function startOfDay(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

function sameLocalDay(iso: string, ref: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  )
}

export async function getMeuDia(
  role: Role,
  userId: string,
  brigadaId: string | null,
  now: Date = new Date(),
): Promise<MeuDiaData> {
  const hoje0 = startOfDay(now)
  const amanha0 = new Date(hoje0)
  amanha0.setDate(amanha0.getDate() + 1)
  const depois0 = new Date(hoje0)
  depois0.setDate(depois0.getDate() + 2)

  const [eventos, prazosAtrasados, atividadesAtrasadas, controlosAtrasados, tarefasRaw, tarefasTotal] =
    await Promise.all([
      getAgendaEvents(role, userId, brigadaId, hoje0, depois0),
      prisma.inquerito.count({
        where: {
          AND: [
            { deletedAt: null },
            { estado: { terminal: false } },
            { dataPrazo: { lt: hoje0 } },
            buildInqueritoWhere(role, userId, brigadaId),
          ],
        },
      }),
      prisma.atividade.count({
        where: {
          AND: [
            { dataPrazo: { lt: hoje0 } },
            { concluidaEm: null },
            { inquerito: { deletedAt: null } },
            buildAtividadePrazoWhere(role, userId, brigadaId),
          ],
        },
      }),
      prisma.controloRealizacao.count({
        where: {
          dataRealizacao: null,
          dataEsperada: { lt: hoje0 },
          controlo: {
            AND: [
              buildControloWhere(role, userId, brigadaId),
              { concluidoEm: null },
              { OR: [{ inqueritoid: null }, { inquerito: { deletedAt: null } }] },
            ],
          },
        },
      }),
      prisma.tarefaInquerito.findMany({
        where: { autorId: userId, concluida: false, inquerito: { deletedAt: null } },
        orderBy: [{ prioridade: 'desc' }, { createdAt: 'desc' }],
        take: TAREFAS_LIMIT,
        select: {
          id: true,
          titulo: true,
          prioridade: true,
          inquerito: { select: { nuipc: true } },
        },
      }),
      prisma.tarefaInquerito.count({
        where: { autorId: userId, concluida: false, inquerito: { deletedAt: null } },
      }),
    ])

  return {
    hoje: eventos.filter((e) => sameLocalDay(e.data, hoje0)),
    amanha: eventos.filter((e) => sameLocalDay(e.data, amanha0)),
    atrasados: {
      prazos: prazosAtrasados,
      atividades: atividadesAtrasadas,
      controlos: controlosAtrasados,
    },
    tarefas: tarefasRaw.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      prioridade: t.prioridade,
      nuipc: t.inquerito.nuipc,
      slug: nuipcToSlug(t.inquerito.nuipc),
    })),
    tarefasTotal,
  }
}
