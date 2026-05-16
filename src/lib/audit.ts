import { prisma } from '@/lib/prisma'
import { getRequestInfo } from '@/lib/request-info'
import type { Prisma } from '@/generated/prisma/client'

type Primitive = string | number | boolean | Date | null | undefined

/**
 * Compute a shallow before/after diff over the named keys.
 * Dates are normalized to ISO strings; undefined values are skipped.
 * Returns { changed: ['field1', ...], before: {...}, after: {...} }
 * or null when nothing changed.
 */
export function diff<T extends Record<string, Primitive>>(
  before: T,
  after: T,
  keys: ReadonlyArray<keyof T>,
): { changed: string[]; before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const beforeOut: Record<string, unknown> = {}
  const afterOut: Record<string, unknown> = {}
  const changed: string[] = []

  for (const key of keys) {
    const a = normalize(before[key])
    const b = normalize(after[key])
    if (a !== b) {
      changed.push(String(key))
      beforeOut[String(key)] = a
      afterOut[String(key)] = b
    }
  }

  if (changed.length === 0) return null
  return { changed, before: beforeOut, after: afterOut }
}

function normalize(v: Primitive): string | number | boolean | null {
  if (v === undefined || v === null) return null
  if (v instanceof Date) return v.toISOString()
  return v
}

interface WriteAuditOpts {
  req: Request
  acao: string
  entidade: string
  entidadeId: string
  utilizadorId: string
  detalhes?: Prisma.InputJsonValue
  tx?: Prisma.TransactionClient
}

export async function writeAudit(opts: WriteAuditOpts) {
  const { ip, userAgent } = getRequestInfo(opts.req)
  const client = opts.tx ?? prisma
  await client.auditLog.create({
    data: {
      acao: opts.acao,
      entidade: opts.entidade,
      entidadeId: opts.entidadeId,
      utilizadorId: opts.utilizadorId,
      ip,
      userAgent,
      detalhes: opts.detalhes,
    },
  })
}
