import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere } from '@/lib/role-scope'
import { applyPolicy } from '@/lib/notifications'
import { childLogger } from '@/lib/logger'
import { TIPO_APREENSAO_LABEL } from '@/lib/validations/apreensao'
import type { Role } from '@/generated/prisma/enums'
import type { Prisma } from '@/generated/prisma/client'

const log = childLogger({ subsystem: 'apreensoes' })

const APREENSAO_SELECT = {
  id: true,
  descricao: true,
  tipo: true,
  tipoOutro: true,
  quantidade: true,
  numeroAuto: true,
  dataApreensao: true,
  local: true,
  apreendidoA: true,
  localCustodia: true,
  estado: true,
  dataDestino: true,
  observacoes: true,
} as const

/** Apreensões de um inquérito (mais recentes primeiro). */
export async function getApreensoesForInquerito(inqueritoid: string) {
  return prisma.apreensao.findMany({
    where: { inqueritoid },
    orderBy: [{ dataApreensao: 'desc' }, { createdAt: 'desc' }],
    select: APREENSAO_SELECT,
  })
}

const PAGE_SIZE = 50

/** Estados em que o objeto ainda está sob custódia (por dar destino). */
export const ESTADOS_APREENSAO_ATIVOS = ['EM_CUSTODIA', 'A_AGUARDAR_EXAME'] as const
/** Estados em que o objeto já teve destino (custódia terminada). */
export const ESTADOS_APREENSAO_TERMINAIS = ['DEVOLVIDO', 'PERDIDO_A_FAVOR_ESTADO', 'DESTRUIDO'] as const

export type ApreensaoEstadoFiltro = 'em-custodia' | 'concluidas' | 'todas'

/** Filtros comuns da listagem global e da exportação. */
export interface ApreensoesGlobalFiltros {
  role: Role
  userId: string
  brigadaId: string | null
  estado?: ApreensaoEstadoFiltro
  /** Texto livre (descricao, numeroAuto, localCustodia ou NUIPC). */
  q?: string
  /** Intervalo de `dataApreensao` (inclusivo, AAAA-MM-DD). */
  de?: Date | null
  ate?: Date | null
}

/**
 * `where` da listagem global, respeitando o scope do inquérito
 * (`buildInqueritoWhere` na relação). Composto por AND para o texto livre
 * nunca alargar o âmbito.
 */
export function buildApreensoesGlobalWhere(opts: ApreensoesGlobalFiltros): Prisma.ApreensaoWhereInput {
  const { role, userId, brigadaId } = opts
  const filtro: ApreensaoEstadoFiltro = opts.estado ?? 'em-custodia'
  const estadoWhere: Prisma.ApreensaoWhereInput =
    filtro === 'em-custodia'
      ? { estado: { in: [...ESTADOS_APREENSAO_ATIVOS] } }
      : filtro === 'concluidas'
        ? { estado: { in: [...ESTADOS_APREENSAO_TERMINAIS] } }
        : {}
  const q = opts.q?.trim()
  const contains = { contains: q ?? '', mode: 'insensitive' as const }
  return {
    AND: [
      { inquerito: { AND: [{ deletedAt: null }, buildInqueritoWhere(role, userId, brigadaId)] } },
      estadoWhere,
      q
        ? {
            OR: [
              { descricao: contains },
              { numeroAuto: contains },
              { localCustodia: contains },
              { inquerito: { nuipc: contains } },
            ],
          }
        : {},
      opts.de || opts.ate
        ? {
            dataApreensao: {
              ...(opts.de && { gte: opts.de }),
              ...(opts.ate && { lte: opts.ate }),
            },
          }
        : {},
    ],
  }
}

export async function getApreensoesGlobal(opts: ApreensoesGlobalFiltros & { page?: number }) {
  const page = Math.max(1, opts.page ?? 1)
  const where = buildApreensoesGlobalWhere(opts)

  const [total, items] = await Promise.all([
    prisma.apreensao.count({ where }),
    prisma.apreensao.findMany({
      where,
      orderBy: [{ dataApreensao: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        ...APREENSAO_SELECT,
        inquerito: { select: { nuipc: true } },
      },
    }),
  ])

  return { items, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), page }
}

/** Todas as linhas filtradas (até `limit`) — para exportação CSV. */
export function getApreensoesExport(opts: ApreensoesGlobalFiltros, limit: number) {
  return prisma.apreensao.findMany({
    where: buildApreensoesGlobalWhere(opts),
    orderBy: [{ dataApreensao: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      ...APREENSAO_SELECT,
      inquerito: { select: { nuipc: true } },
    },
  })
}

/**
 * Motor do alerta "apreensão parada" — chamado pelo deadline-check partilhado
 * (worker + rota). Objetos ainda em custódia / a aguardar exame, apreendidos há
 * mais de `apreensaoAlertaDias`, geram um lembrete único ao inspetor titular
 * (marca `alertaParadaEnviado` para não repetir). Ignora inquéritos apagados.
 */
export async function checkApreensoesParadas(now: Date = new Date()): Promise<{ alertas: number }> {
  const config = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { apreensaoAlertaDias: true },
  })
  // Sem linha de config → default 180 (alerta ativo). Linha com valor `null`
  // (o utilizador limpou o campo para desligar) ou ≤ 0 → alerta desligado.
  // NB: não usar `?? 180`, senão o `null` de "desligado" voltaria a 180.
  const dias = config ? config.apreensaoAlertaDias : 180
  if (dias == null || dias <= 0) return { alertas: 0 }

  const limite = new Date(now)
  limite.setDate(limite.getDate() - dias)

  const paradas = await prisma.apreensao.findMany({
    where: {
      estado: { in: ['EM_CUSTODIA', 'A_AGUARDAR_EXAME'] },
      alertaParadaEnviado: false,
      dataApreensao: { lt: limite },
      inquerito: { deletedAt: null },
    },
    select: {
      id: true,
      descricao: true,
      dataApreensao: true,
      inquerito: { select: { id: true, nuipc: true, inspetorId: true } },
    },
  })

  const jobs: Promise<unknown>[] = []
  let alertas = 0
  for (const a of paradas) {
    if (!a.inquerito.inspetorId) continue
    alertas++
    jobs.push(
      applyPolicy({
        tipo: 'APREENSAO_PARADA',
        titulo: `Apreensão por dar destino — ${a.inquerito.nuipc}`,
        mensagem: `O objeto "${a.descricao}" está apreendido desde ${a.dataApreensao.toLocaleDateString('pt-PT', { timeZone: 'UTC' })} e continua por devolver/dar destino.`,
        inqueritoid: a.inquerito.id,
        naturalUserId: a.inquerito.inspetorId,
      })
        .then(() =>
          prisma.apreensao.update({ where: { id: a.id }, data: { alertaParadaEnviado: true } }),
        )
        .catch((err) =>
          log.error({ err, apreensaoId: a.id }, 'Falha ao notificar apreensão parada'),
        ),
    )
  }

  await Promise.allSettled(jobs)
  if (alertas > 0) log.info({ alertas }, 'Alertas de apreensão parada enviados')
  return { alertas }
}

/** Etiqueta legível do tipo (usa o texto livre quando é OUTRO). */
export function apreensaoTipoLabel(tipo: string, tipoOutro: string | null): string {
  if (tipo === 'OUTRO') return tipoOutro?.trim() || 'Outro'
  return TIPO_APREENSAO_LABEL[tipo as keyof typeof TIPO_APREENSAO_LABEL] ?? tipo
}
