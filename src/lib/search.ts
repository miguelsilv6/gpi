/**
 * Pesquisa global (paleta de comandos / Cmd+K).
 *
 * Padrão de segurança em duas fases para a pesquisa full-text:
 *   1. `$queryRaw` faz o match full-text (Português) e devolve apenas IDs
 *      candidatos, ordenados por relevância (ts_rank). Usa os índices GIN de
 *      expressão criados na migração 20260623150000.
 *   2. O Prisma volta a buscar esses IDs aplicando o scope por role (os mesmos
 *      helpers usados em todo o lado), pelo que a SEGURANÇA nunca depende do
 *      SQL cru — o termo de pesquisa não consegue alargar o âmbito.
 *
 * A ordenação por relevância da fase 1 é reposta após a filtragem da fase 2.
 */
import { prisma } from '@/lib/prisma'
import {
  buildInqueritoWhere,
  buildNotaInqueritoAutorWhere,
} from '@/lib/role-scope'
import { nuipcToSlug } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

const INQUERITO_LIMIT = 8
const FT_CANDIDATE_LIMIT = 50
const FT_RESULT_LIMIT = 6
const DOC_LIMIT = 6

export interface InqueritoHit {
  id: string
  nuipc: string
  slug: string
  crimeNome: string
  estadoNome: string
  inspetorNome: string | null
}

export interface NotaHit {
  id: string
  nuipc: string
  slug: string
  titulo: string | null
  snippet: string
}

export interface AtividadeHit {
  id: string
  nuipc: string
  slug: string
  descricao: string
  snippet: string
}

export interface DocumentoHit {
  id: string
  nuipc: string
  slug: string
  filename: string
}

export interface SearchResults {
  inqueritos: InqueritoHit[]
  notas: NotaHit[]
  atividades: AtividadeHit[]
  documentos: DocumentoHit[]
}

/** Pré-visualização curta de um conteúdo Markdown (remove marcas leves). */
function snippet(text: string, max = 140): string {
  const clean = text.replace(/[`*_#>]+/g, '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean
}

/** Repõe a ordem de relevância da fase SQL após a filtragem por scope. */
function reorderByCandidates<T extends { id: string }>(items: T[], orderedIds: string[]): T[] {
  const rank = new Map(orderedIds.map((id, i) => [id, i]))
  return [...items].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
}

export async function searchInqueritos(
  q: string,
  role: Role,
  userId: string,
  brigadaId: string | null,
): Promise<InqueritoHit[]> {
  const scopeWhere = buildInqueritoWhere(role, userId, brigadaId)
  const rows = await prisma.inquerito.findMany({
    where: {
      AND: [
        { deletedAt: null },
        {
          OR: [
            { nuipc: { contains: q, mode: 'insensitive' } },
            { nai: { contains: q, mode: 'insensitive' } },
            { denuncianteNome: { contains: q, mode: 'insensitive' } },
            { denuncianteNif: { contains: q, mode: 'insensitive' } },
            { etiquetas: { some: { nome: { contains: q, mode: 'insensitive' } } } },
          ],
        },
        scopeWhere,
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: INQUERITO_LIMIT,
    select: {
      id: true,
      nuipc: true,
      natureza: true,
      crime: { select: { nome: true } },
      estado: { select: { nome: true } },
      inspetor: { select: { nome: true } },
    },
  })
  return rows.map((i) => ({
    id: i.id,
    nuipc: i.nuipc,
    slug: nuipcToSlug(i.nuipc),
    crimeNome: i.crime?.nome ?? i.natureza,
    estadoNome: i.estado.nome,
    inspetorNome: i.inspetor?.nome ?? null,
  }))
}

export async function searchNotas(
  q: string,
  role: Role,
  userId: string,
  brigadaId: string | null,
): Promise<NotaHit[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "NotaInquerito"
    WHERE to_tsvector('portuguese', coalesce("titulo", '') || ' ' || "conteudo")
          @@ websearch_to_tsquery('portuguese', ${q})
    ORDER BY ts_rank(
               to_tsvector('portuguese', coalesce("titulo", '') || ' ' || "conteudo"),
               websearch_to_tsquery('portuguese', ${q})
             ) DESC
    LIMIT ${FT_CANDIDATE_LIMIT}
  `
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) return []

  const notas = await prisma.notaInquerito.findMany({
    where: {
      AND: [
        { id: { in: ids } },
        // Mesma regra do separador global /notas: não-INSPETOR só vê as suas.
        buildNotaInqueritoAutorWhere(role, userId),
        { inquerito: { AND: [{ deletedAt: null }, buildInqueritoWhere(role, userId, brigadaId)] } },
      ],
    },
    select: {
      id: true,
      titulo: true,
      conteudo: true,
      inquerito: { select: { nuipc: true } },
    },
  })

  return reorderByCandidates(notas, ids)
    .slice(0, FT_RESULT_LIMIT)
    .map((n) => ({
      id: n.id,
      nuipc: n.inquerito.nuipc,
      slug: nuipcToSlug(n.inquerito.nuipc),
      titulo: n.titulo,
      snippet: snippet(n.conteudo),
    }))
}

export async function searchAtividades(
  q: string,
  role: Role,
  userId: string,
  brigadaId: string | null,
): Promise<AtividadeHit[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "Atividade"
    WHERE to_tsvector('portuguese', coalesce("descricao", '') || ' ' || coalesce("observacoes", ''))
          @@ websearch_to_tsquery('portuguese', ${q})
    ORDER BY ts_rank(
               to_tsvector('portuguese', coalesce("descricao", '') || ' ' || coalesce("observacoes", '')),
               websearch_to_tsquery('portuguese', ${q})
             ) DESC
    LIMIT ${FT_CANDIDATE_LIMIT}
  `
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) return []

  const atividades = await prisma.atividade.findMany({
    where: {
      AND: [
        { id: { in: ids } },
        { inquerito: { AND: [{ deletedAt: null }, buildInqueritoWhere(role, userId, brigadaId)] } },
      ],
    },
    select: {
      id: true,
      descricao: true,
      observacoes: true,
      inquerito: { select: { nuipc: true } },
    },
  })

  return reorderByCandidates(atividades, ids)
    .slice(0, FT_RESULT_LIMIT)
    .map((a) => ({
      id: a.id,
      nuipc: a.inquerito.nuipc,
      slug: nuipcToSlug(a.inquerito.nuipc),
      descricao: a.descricao,
      snippet: a.observacoes ? snippet(a.observacoes) : '',
    }))
}

/**
 * Documentos: o nome do ficheiro é curto, pelo que uma pesquisa por substring
 * (ILIKE) é mais adequada que full-text. Gated pelo módulo de anexos a montante
 * (a rota só chama esta função quando o módulo está ativo para o role).
 */
export async function searchDocumentos(
  q: string,
  role: Role,
  userId: string,
  brigadaId: string | null,
): Promise<DocumentoHit[]> {
  const docs = await prisma.documento.findMany({
    where: {
      AND: [
        { filename: { contains: q, mode: 'insensitive' } },
        { inquerito: { AND: [{ deletedAt: null }, buildInqueritoWhere(role, userId, brigadaId)] } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: DOC_LIMIT,
    select: {
      id: true,
      filename: true,
      inquerito: { select: { nuipc: true } },
    },
  })
  return docs.map((d) => ({
    id: d.id,
    nuipc: d.inquerito.nuipc,
    slug: nuipcToSlug(d.inquerito.nuipc),
    filename: d.filename,
  }))
}
