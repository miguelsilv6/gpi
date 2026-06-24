/**
 * Agregação de eventos para a Agenda (vista de calendário). Junta quatro fontes
 * num formato comum `AgendaEvent`, cada uma com o seu âmbito por role:
 *
 *  - inquerito   — prazos de inquéritos ativos (buildInqueritoWhere).
 *  - atividade   — atividades com prazo, pendentes e próprias (buildAtividadePrazoWhere).
 *  - controlo    — próximas realizações de controlos próprias (buildControloWhere).
 *  - diligencia  — datas de tribunal / atos processuais (buildDiligenciaWhere).
 *
 * Os prazos/atividades/controlos seguem a mesma semântica da página /prazos
 * (atividades e controlos são pessoais); os prazos de inquérito e as diligências
 * abrem por role (brigada / global).
 */
import { prisma } from '@/lib/prisma'
import {
  buildInqueritoWhere,
  buildAtividadePrazoWhere,
  buildControloWhere,
  buildDiligenciaWhere,
} from '@/lib/role-scope'
import { nuipcToSlug } from '@/lib/utils'
import type { Role, TipoDiligencia } from '@/generated/prisma/enums'

export type AgendaEventTipo = 'inquerito' | 'atividade' | 'controlo' | 'diligencia'

export interface AgendaEvent {
  id: string
  tipo: AgendaEventTipo
  data: string // ISO datetime
  titulo: string
  nuipc: string | null
  slug: string | null
  concluido: boolean
  // Específicos da diligência:
  diligenciaId?: string
  subtipo?: TipoDiligencia
  local?: string | null
  observacoes?: string | null
  criadoPorId?: string
  inqueritoId?: string | null
  dataFim?: string | null
}

/** Devolve todos os eventos de agenda no intervalo [from, to). */
export async function getAgendaEvents(
  role: Role,
  userId: string,
  brigadaId: string | null,
  from: Date,
  to: Date,
): Promise<AgendaEvent[]> {
  const [inqueritos, atividades, realizacoes, diligencias] = await Promise.all([
    prisma.inquerito.findMany({
      where: {
        AND: [
          { deletedAt: null },
          { estado: { terminal: false } },
          { dataPrazo: { gte: from, lt: to } },
          buildInqueritoWhere(role, userId, brigadaId),
        ],
      },
      select: { id: true, nuipc: true, dataPrazo: true, natureza: true, crime: { select: { nome: true } } },
    }),
    prisma.atividade.findMany({
      where: {
        AND: [
          { dataPrazo: { gte: from, lt: to } },
          { concluidaEm: null },
          { inquerito: { deletedAt: null } },
          buildAtividadePrazoWhere(role, userId, brigadaId),
        ],
      },
      select: { id: true, descricao: true, dataPrazo: true, inquerito: { select: { nuipc: true } } },
    }),
    prisma.controloRealizacao.findMany({
      where: {
        dataRealizacao: null,
        dataEsperada: { gte: from, lt: to },
        controlo: buildControloWhere(role, userId, brigadaId),
      },
      select: {
        id: true,
        numero: true,
        dataEsperada: true,
        controlo: { select: { descricao: true, inquerito: { select: { nuipc: true } } } },
      },
    }),
    prisma.diligencia.findMany({
      where: {
        AND: [{ dataInicio: { gte: from, lt: to } }, buildDiligenciaWhere(role, userId, brigadaId)],
      },
      select: {
        id: true,
        titulo: true,
        tipo: true,
        dataInicio: true,
        dataFim: true,
        local: true,
        observacoes: true,
        concluida: true,
        criadoPorId: true,
        inqueritoId: true,
        inquerito: { select: { nuipc: true } },
      },
    }),
  ])

  const events: AgendaEvent[] = []

  for (const i of inqueritos) {
    events.push({
      id: `inq:${i.id}`,
      tipo: 'inquerito',
      data: i.dataPrazo!.toISOString(),
      titulo: `Prazo: ${i.crime?.nome ?? i.natureza}`,
      nuipc: i.nuipc,
      slug: nuipcToSlug(i.nuipc),
      concluido: false,
    })
  }
  for (const a of atividades) {
    events.push({
      id: `ativ:${a.id}`,
      tipo: 'atividade',
      data: a.dataPrazo!.toISOString(),
      titulo: a.descricao,
      nuipc: a.inquerito.nuipc,
      slug: nuipcToSlug(a.inquerito.nuipc),
      concluido: false,
    })
  }
  for (const r of realizacoes) {
    events.push({
      id: `ctrl:${r.id}`,
      tipo: 'controlo',
      data: r.dataEsperada.toISOString(),
      titulo: `${r.numero}.º controlo: ${r.controlo.descricao}`,
      nuipc: r.controlo.inquerito?.nuipc ?? null,
      slug: r.controlo.inquerito ? nuipcToSlug(r.controlo.inquerito.nuipc) : null,
      concluido: false,
    })
  }
  for (const d of diligencias) {
    events.push({
      id: `dilig:${d.id}`,
      tipo: 'diligencia',
      data: d.dataInicio.toISOString(),
      titulo: d.titulo,
      nuipc: d.inquerito?.nuipc ?? null,
      slug: d.inquerito ? nuipcToSlug(d.inquerito.nuipc) : null,
      concluido: d.concluida,
      diligenciaId: d.id,
      subtipo: d.tipo,
      local: d.local,
      observacoes: d.observacoes,
      criadoPorId: d.criadoPorId,
      inqueritoId: d.inqueritoId,
      dataFim: d.dataFim ? d.dataFim.toISOString() : null,
    })
  }

  events.sort((a, b) => a.data.localeCompare(b.data))
  return events
}
