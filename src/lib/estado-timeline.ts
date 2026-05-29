import { prisma } from '@/lib/prisma'
import { listEstados } from '@/lib/estados'
import { ESTADO_LABELS_FALLBACK } from '@/lib/constants'

export interface EstadoTimelineEntry {
  at: string
  estadoCodigo: string
  estadoNome: string
  porNome: string | null
  motivo?: string
}

const STATE_ACOES = [
  'CREATE_INQUERITO',
  'UPDATE_INQUERITO',
  'AUTO_TRANSITION_INQUERITO',
  'REOPEN_INQUERITO',
  'BULK_CHANGESTATE',
  'BULK_ASSIGN',
] as const

/**
 * Reconstrói a cronologia de estados de um inquérito a partir do AuditLog.
 * Não há tabela dedicada — derivamos das ações que registam mudanças de estado:
 *  - CREATE_INQUERITO        → detalhes.estadoCodigo (estado inicial)
 *  - UPDATE_INQUERITO        → só se detalhes.changed inclui 'estadoCodigo'
 *  - AUTO_TRANSITION_INQUERITO → detalhes.estadoNovo
 *  - REOPEN_INQUERITO        → detalhes.estadoNovo (+ motivo)
 */
export async function getEstadoTimeline(inqueritoId: string): Promise<EstadoTimelineEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entidade: 'Inquerito', entidadeId: inqueritoId, acao: { in: [...STATE_ACOES] } },
    orderBy: { createdAt: 'asc' },
    select: { acao: true, createdAt: true, detalhes: true, utilizadorId: true },
  })
  if (rows.length === 0) return []

  // codigo → nome (catálogo dinâmico, com fallback para os estados standard).
  const estados = await listEstados()
  const nomeByCodigo = new Map(estados.map((e) => [e.codigo, e.nome]))
  const resolveNome = (codigo: string) =>
    nomeByCodigo.get(codigo) ?? ESTADO_LABELS_FALLBACK[codigo] ?? codigo

  // Resolver nomes de autores (ignora sentinelas de sistema).
  const userIds = [...new Set(rows.map((r) => r.utilizadorId))].filter(
    (id) => id && !id.startsWith('__'),
  )
  const users = userIds.length
    ? await prisma.utilizador.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nome: true },
      })
    : []
  const nomeByUserId = new Map(users.map((u) => [u.id, u.nome]))

  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  const entries: EstadoTimelineEntry[] = []

  for (const r of rows) {
    const d = (r.detalhes ?? {}) as Record<string, unknown>
    let codigo: string | undefined
    let motivo: string | undefined

    switch (r.acao) {
      case 'CREATE_INQUERITO':
        codigo = str(d.estadoCodigo)
        break
      case 'UPDATE_INQUERITO': {
        const changed = Array.isArray(d.changed) ? (d.changed as string[]) : []
        if (!changed.includes('estadoCodigo')) continue
        const after = (d.after ?? {}) as Record<string, unknown>
        codigo = str(after.estadoCodigo)
        break
      }
      case 'AUTO_TRANSITION_INQUERITO':
        codigo = str(d.estadoNovo)
        break
      case 'REOPEN_INQUERITO':
        codigo = str(d.estadoNovo)
        motivo = str(d.motivo)
        break
      case 'BULK_CHANGESTATE':
      case 'BULK_ASSIGN': {
        const after = (d.after ?? {}) as Record<string, unknown>
        codigo = str(after.estadoCodigo)
        break
      }
    }

    if (!codigo) continue
    entries.push({
      at: r.createdAt.toISOString(),
      estadoCodigo: codigo,
      estadoNome: resolveNome(codigo),
      porNome: nomeByUserId.get(r.utilizadorId) ?? null,
      ...(motivo ? { motivo } : {}),
    })
  }

  return entries
}
