/**
 * Deteção de possíveis conexões entre inquéritos pelo denunciante (fase 1 —
 * sem entidade nova): dois inquéritos "ligam-se" quando partilham o NIF, o
 * contacto telefónico ou o email do denunciante.
 *
 * Matching robusto a formatação:
 *   - NIF: só dígitos ("123 456 789" ≡ "123456789"); exige ≥ 9 dígitos.
 *   - Contacto: só dígitos, comparados pelos ÚLTIMOS 9 ("+351 912 345 678" ≡
 *     "912345678"); exige ≥ 9 dígitos.
 *   - Email: lowercase + trim; exige um "@".
 *
 * O âmbito por role segue o padrão das relações: os candidatos encontram-se
 * globalmente (SQL parametrizado, duas fases como em search.ts) mas só se
 * revelam inquéritos que o utilizador pode ler (buildInqueritoWhere).
 */
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere } from '@/lib/role-scope'
import { nuipcToSlug } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

export type ConexaoCampo = 'nif' | 'contacto' | 'email'

export interface ConexaoHit {
  id: string
  nuipc: string
  slug: string
  crimeNome: string
  estadoNome: string
  inspetorNome: string | null
  /** Campos do denunciante que coincidem. */
  matches: ConexaoCampo[]
}

export interface ConexaoCriterios {
  nif?: string | null
  contacto?: string | null
  email?: string | null
}

const CANDIDATE_LIMIT = 50
const MIN_DIGITOS = 9

/** Só dígitos; null se ficar com menos de 9 (curto demais para identificar). */
export function normalizarNif(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  return digits.length >= MIN_DIGITOS ? digits : null
}

/**
 * Só dígitos, reduzidos aos últimos 9 — absorve indicativos ("+351", "00351")
 * e formatação. Null se tiver menos de 9 dígitos.
 */
export function normalizarContacto(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  return digits.length >= MIN_DIGITOS ? digits.slice(-9) : null
}

export function normalizarEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? '').trim().toLowerCase()
  return email.includes('@') && email.length >= 5 ? email : null
}

interface CandidateRow {
  id: string
  nif: string | null
  contacto: string | null
  email: string | null
}

export async function findConexoes(
  criterios: ConexaoCriterios,
  excludeId: string | null,
  role: Role,
  userId: string,
  brigadaId: string | null,
): Promise<ConexaoHit[]> {
  const nif = normalizarNif(criterios.nif)
  const contacto = normalizarContacto(criterios.contacto)
  const email = normalizarEmail(criterios.email)
  if (!nif && !contacto && !email) return []

  // Fase 1: candidatos por igualdade normalizada, direto em SQL (parametrizado).
  // Passa-se sempre os três critérios; os nulos desligam o respetivo ramo.
  // '[^0-9]' em vez de '\D' — evita ambiguidade de escapes em tagged templates.
  const rows = await prisma.$queryRaw<CandidateRow[]>`
    SELECT "id",
           "denuncianteNif"      AS "nif",
           "denuncianteContacto" AS "contacto",
           "denuncianteEmail"    AS "email"
    FROM "Inquerito"
    WHERE "deletedAt" IS NULL
      AND (
        (${nif}::text IS NOT NULL
          AND regexp_replace(coalesce("denuncianteNif", ''), '[^0-9]', '', 'g') = ${nif})
        OR (${contacto}::text IS NOT NULL
          AND length(regexp_replace(coalesce("denuncianteContacto", ''), '[^0-9]', '', 'g')) >= ${MIN_DIGITOS}
          AND right(regexp_replace(coalesce("denuncianteContacto", ''), '[^0-9]', '', 'g'), 9) = ${contacto})
        OR (${email}::text IS NOT NULL
          AND lower(trim(coalesce("denuncianteEmail", ''))) = ${email})
      )
    LIMIT ${CANDIDATE_LIMIT}
  `

  const candidateIds = rows.map((r) => r.id).filter((id) => id !== excludeId)
  if (candidateIds.length === 0) return []

  // Fase 2: revelar só o que está no âmbito do utilizador.
  const legiveis = await prisma.inquerito.findMany({
    where: {
      AND: [
        { id: { in: candidateIds } },
        { deletedAt: null },
        buildInqueritoWhere(role, userId, brigadaId),
      ],
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      nuipc: true,
      natureza: true,
      crime: { select: { nome: true } },
      estado: { select: { nome: true } },
      inspetor: { select: { nome: true } },
    },
  })

  const rowById = new Map(rows.map((r) => [r.id, r]))
  return legiveis.map((inq) => {
    const cand = rowById.get(inq.id)
    const matches: ConexaoCampo[] = []
    if (nif && cand && normalizarNif(cand.nif) === nif) matches.push('nif')
    if (contacto && cand && normalizarContacto(cand.contacto) === contacto) matches.push('contacto')
    if (email && cand && normalizarEmail(cand.email) === email) matches.push('email')
    return {
      id: inq.id,
      nuipc: inq.nuipc,
      slug: nuipcToSlug(inq.nuipc),
      crimeNome: inq.crime?.nome ?? inq.natureza,
      estadoNome: inq.estado.nome,
      inspetorNome: inq.inspetor?.nome ?? null,
      matches,
    }
  })
}

/**
 * Conexões para a página de detalhe: usa o denunciante do próprio inquérito
 * e omite os que já estão formalmente relacionados (esses aparecem na secção
 * de Inquéritos relacionados).
 */
export async function getConexoesForInquerito(
  inqueritoId: string,
  role: Role,
  userId: string,
  brigadaId: string | null,
): Promise<ConexaoHit[]> {
  const inq = await prisma.inquerito.findUnique({
    where: { id: inqueritoId },
    select: { denuncianteNif: true, denuncianteContacto: true, denuncianteEmail: true },
  })
  if (!inq) return []

  const hits = await findConexoes(
    { nif: inq.denuncianteNif, contacto: inq.denuncianteContacto, email: inq.denuncianteEmail },
    inqueritoId,
    role,
    userId,
    brigadaId,
  )
  if (hits.length === 0) return []

  const hitIds = hits.map((h) => h.id)
  const relacionados = await prisma.inqueritoRelacao.findMany({
    where: {
      OR: [
        { origemId: inqueritoId, destinoId: { in: hitIds } },
        { destinoId: inqueritoId, origemId: { in: hitIds } },
      ],
    },
    select: { origemId: true, destinoId: true },
  })
  const jaLigados = new Set(
    relacionados.map((r) => (r.origemId === inqueritoId ? r.destinoId : r.origemId)),
  )
  return hits.filter((h) => !jaLigados.has(h.id))
}
