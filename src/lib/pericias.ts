import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere } from '@/lib/role-scope'
import { applyPolicy } from '@/lib/notifications'
import { childLogger } from '@/lib/logger'
import { TIPO_PERICIA_LABEL } from '@/lib/validations/pericia'
import type { Role } from '@/generated/prisma/enums'
import type { Prisma } from '@/generated/prisma/client'

const log = childLogger({ subsystem: 'pericias' })

const PERICIA_SELECT = {
  id: true,
  tipo: true,
  tipoOutro: true,
  descricao: true,
  entidade: true,
  numeroReferencia: true,
  dataPedido: true,
  dataPrevista: true,
  estado: true,
  dataConclusao: true,
  resultado: true,
  observacoes: true,
  apreensaoId: true,
  apreensao: { select: { id: true, descricao: true } },
} as const

/** Perícias de um inquérito (mais recentes primeiro). */
export async function getPericiasForInquerito(inqueritoid: string) {
  return prisma.pericia.findMany({
    where: { inqueritoid },
    orderBy: [{ dataPedido: 'desc' }, { createdAt: 'desc' }],
    select: PERICIA_SELECT,
  })
}

const PAGE_SIZE = 50

/** Estados em que a perícia ainda está pendente de resultado. */
export const ESTADOS_PERICIA_PENDENTES = ['SOLICITADA', 'EM_CURSO'] as const
/** Estados terminais (concluída ou cancelada). */
export const ESTADOS_PERICIA_TERMINAIS = ['CONCLUIDA', 'CANCELADA'] as const

export type PericiaEstadoFiltro = 'pendentes' | 'concluidas' | 'todas'

/**
 * Listagem global de perícias, respeitando o scope do inquérito
 * (`buildInqueritoWhere` na relação). Filtro por grupo de estado.
 */
export async function getPericiasGlobal(opts: {
  role: Role
  userId: string
  brigadaId: string | null
  estado?: PericiaEstadoFiltro
  page?: number
}) {
  const { role, userId, brigadaId } = opts
  const filtro: PericiaEstadoFiltro = opts.estado ?? 'pendentes'
  const page = Math.max(1, opts.page ?? 1)

  const estadoWhere: Prisma.PericiaWhereInput =
    filtro === 'pendentes'
      ? { estado: { in: [...ESTADOS_PERICIA_PENDENTES] } }
      : filtro === 'concluidas'
        ? { estado: { in: [...ESTADOS_PERICIA_TERMINAIS] } }
        : {}

  const where: Prisma.PericiaWhereInput = {
    inquerito: { AND: [{ deletedAt: null }, buildInqueritoWhere(role, userId, brigadaId)] },
    ...estadoWhere,
  }

  const [total, items] = await Promise.all([
    prisma.pericia.count({ where }),
    prisma.pericia.findMany({
      where,
      orderBy: [{ dataPrevista: 'asc' }, { dataPedido: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        ...PERICIA_SELECT,
        inquerito: { select: { nuipc: true } },
      },
    }),
  ])

  return { items, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), page }
}

/**
 * Motor do alerta "perícia atrasada" — chamado pelo deadline-check partilhado
 * (worker + rota). Perícias ainda pendentes (solicitadas/em curso) cuja data
 * prevista de conclusão já passou geram um lembrete único ao inspetor titular
 * (marca `alertaAtrasoEnviado`). Ignora inquéritos apagados.
 */
export async function checkPericiasAtrasadas(now: Date = new Date()): Promise<{ alertas: number }> {
  const atrasadas = await prisma.pericia.findMany({
    where: {
      estado: { in: [...ESTADOS_PERICIA_PENDENTES] },
      alertaAtrasoEnviado: false,
      dataPrevista: { not: null, lt: now },
      inquerito: { deletedAt: null },
    },
    select: {
      id: true,
      descricao: true,
      dataPrevista: true,
      inquerito: { select: { id: true, nuipc: true, inspetorId: true } },
    },
  })

  const jobs: Promise<unknown>[] = []
  let alertas = 0
  for (const p of atrasadas) {
    if (!p.inquerito.inspetorId || !p.dataPrevista) continue
    alertas++
    jobs.push(
      applyPolicy({
        tipo: 'PERICIA_ATRASADA',
        titulo: `Perícia atrasada — ${p.inquerito.nuipc}`,
        mensagem: `A perícia "${p.descricao}" tinha conclusão prevista para ${p.dataPrevista.toLocaleDateString('pt-PT', { timeZone: 'UTC' })} e continua por concluir.`,
        inqueritoid: p.inquerito.id,
        naturalUserId: p.inquerito.inspetorId,
      })
        .then(() =>
          prisma.pericia.update({ where: { id: p.id }, data: { alertaAtrasoEnviado: true } }),
        )
        .catch((err) => log.error({ err, periciaId: p.id }, 'Falha ao notificar perícia atrasada')),
    )
  }

  await Promise.allSettled(jobs)
  if (alertas > 0) log.info({ alertas }, 'Alertas de perícia atrasada enviados')
  return { alertas }
}

/** Etiqueta legível do tipo (usa o texto livre quando é OUTRO). */
export function periciaTipoLabel(tipo: string, tipoOutro: string | null): string {
  if (tipo === 'OUTRO') return tipoOutro?.trim() || 'Outra'
  return TIPO_PERICIA_LABEL[tipo as keyof typeof TIPO_PERICIA_LABEL] ?? tipo
}
