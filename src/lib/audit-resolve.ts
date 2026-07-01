import { prisma } from '@/lib/prisma'

/**
 * Campos de FK que aparecem em `AuditLog.detalhes` e que devem ser mostrados
 * como o nome da entidade referenciada, não o id em bruto. Resolvido no
 * momento da leitura (não da escrita) para corrigir também as entradas já
 * gravadas antes deste resolver existir.
 *
 * Um id que já não resolve (registo entretanto apagado) é deixado como está
 * — preferimos mostrar o id em bruto a fazê-lo desaparecer silenciosamente.
 */
type Resolver = (ids: string[]) => Promise<Map<string, string>>

function toNameMap(rows: { id: string; nome: string }[]): Map<string, string> {
  return new Map(rows.map((r) => [r.id, r.nome]))
}

async function resolveCrime(ids: string[]): Promise<Map<string, string>> {
  return toNameMap(await prisma.crime.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }))
}
async function resolveTribunal(ids: string[]): Promise<Map<string, string>> {
  return toNameMap(await prisma.tribunal.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }))
}
async function resolveSeccao(ids: string[]): Promise<Map<string, string>> {
  return toNameMap(await prisma.seccao.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }))
}
async function resolveComarca(ids: string[]): Promise<Map<string, string>> {
  return toNameMap(await prisma.comarca.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }))
}
async function resolveBrigada(ids: string[]): Promise<Map<string, string>> {
  return toNameMap(await prisma.brigada.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }))
}
async function resolveEstado(ids: string[]): Promise<Map<string, string>> {
  return toNameMap(await prisma.estadoInquerito.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }))
}
async function resolveUtilizador(ids: string[]): Promise<Map<string, string>> {
  return toNameMap(await prisma.utilizador.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }))
}

const FIELD_RESOLVERS: Record<string, Resolver> = {
  crimeId: resolveCrime,
  tribunalId: resolveTribunal,
  seccaoId: resolveSeccao,
  comarcaId: resolveComarca,
  brigadaId: resolveBrigada,
  estadoId: resolveEstado,
  inspetorId: resolveUtilizador,
  // Usado por TRANSFER_INQUERITO para o inspetor que ficou por atribuir.
  inspetorRemovido: resolveUtilizador,
}

// Além do nível de topo, os shapes de diff guardam os campos dentro de
// `before`/`after` (UPDATE_INQUERITO) ou dentro de before/after aninhados
// nas ações em massa (BULK_*) — ambos usam as mesmas duas chaves.
const SUB_OBJECT_KEYS = ['before', 'after'] as const

function collectIds(obj: unknown, idsByField: Map<string, Set<string>>): void {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return
  const rec = obj as Record<string, unknown>
  for (const field of Object.keys(FIELD_RESOLVERS)) {
    const v = rec[field]
    if (typeof v === 'string' && v.length > 0) {
      if (!idsByField.has(field)) idsByField.set(field, new Set())
      idsByField.get(field)!.add(v)
    }
  }
}

function rewriteIds(obj: unknown, nameMapByField: Map<string, Map<string, string>>): void {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return
  const rec = obj as Record<string, unknown>
  for (const field of Object.keys(FIELD_RESOLVERS)) {
    const v = rec[field]
    if (typeof v === 'string' && v.length > 0) {
      const name = nameMapByField.get(field)?.get(v)
      if (name) rec[field] = name
    }
  }
}

/**
 * Reescreve, no próprio array, os campos de FK conhecidos dentro de
 * `detalhes` (topo, ou dentro de `before`/`after`) para o nome da entidade
 * referenciada. Usado pelos endpoints que servem o histórico de auditoria
 * (histórico do inquérito e /auditlog global) antes de responder ao cliente.
 */
export async function resolveAuditDetalhesNames(logs: { detalhes: unknown }[]): Promise<void> {
  const idsByField = new Map<string, Set<string>>()
  for (const log of logs) {
    const d = log.detalhes
    if (!d || typeof d !== 'object') continue
    collectIds(d, idsByField)
    for (const k of SUB_OBJECT_KEYS) collectIds((d as Record<string, unknown>)[k], idsByField)
  }
  if (idsByField.size === 0) return

  const nameMapByField = new Map<string, Map<string, string>>()
  await Promise.all(
    Array.from(idsByField.entries()).map(async ([field, ids]) => {
      nameMapByField.set(field, await FIELD_RESOLVERS[field]!(Array.from(ids)))
    }),
  )

  for (const log of logs) {
    const d = log.detalhes
    if (!d || typeof d !== 'object') continue
    rewriteIds(d, nameMapByField)
    for (const k of SUB_OBJECT_KEYS) rewriteIds((d as Record<string, unknown>)[k], nameMapByField)
  }
}
