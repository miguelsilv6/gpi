import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { writeAudit } from '@/lib/audit'
import { parseCSVWithHeader } from '@/lib/csv-parser'
import { NUIPC_REGEX, RATE_LIMITS } from '@/lib/constants'
import { enforceRateLimit, clientFingerprint } from '@/lib/rate-limit'
import type { Role } from '@/generated/prisma/enums'

const MAX_ROWS = 1000
const MAX_BYTES = 1_000_000

const bodySchema = z.object({
  csv: z.string().min(1).max(MAX_BYTES, `CSV demasiado grande (limite ${MAX_BYTES} bytes)`),
  confirm: z.boolean().default(false),
})

const REQUIRED_HEADERS = [
  'NUIPC',
  'NAI',
] as const

const OPTIONAL_HEADERS = [
  'Crime',
  'Estado',
  'Data Abertura',
  'Brigada',
  'Prazo',
  'Data Conclusão',
  'Inspetor (email)',
  'Tribunal',
  'Procurador',
  'Oficial de Justiça',
  'VoIP',
  'Notas Tribunal',
  'Notas',
  'Denunciante Nome',
  'Denunciante Tipo',
  'Denunciante NIF',
  'Denunciante Morada',
  'Denunciante Cód. Postal',
  'Denunciante Localidade',
  'Denunciante Contacto',
  'Denunciante Email',
  'Denunciante Responsável',
  'Denunciante Notas',
] as const

type AllHeaders = (typeof REQUIRED_HEADERS)[number] | (typeof OPTIONAL_HEADERS)[number]

interface ValidatedRow {
  /** 2-based line in the file (1 = header). */
  line: number
  /** Original cell values, keyed by header. */
  raw: Record<string, string>
  /** Errors collected for this row (empty = row will commit). */
  errors: string[]
  /** Normalized payload — only populated when errors is empty. */
  payload?: {
    nuipc: string
    nai: string
    crimeId: string | null
    crimeNome: string
    estadoId: string
    estadoCodigo: string
    estadoTerminal: boolean
    dataAbertura: Date
    dataPrazo: Date | null
    dataConclusao: Date | null
    brigadaId: string | null
    brigadaNome: string | null
    inspetorId: string | null
    inspetorEmail: string | null
    tribunal: string | null
    procurador: string | null
    oficialJustica: string | null
    voip: string | null
    notasTribunal: string | null
    notas: string | null
    denuncianteNome: string | null
    denuncianteTipo: string | null
    denuncianteNif: string | null
    denuncianteMorada: string | null
    denuncianteCodPostal: string | null
    denuncianteLocalidade: string | null
    denuncianteContacto: string | null
    denuncianteEmail: string | null
    denuncianteResponsavel: string | null
    denuncianteNotas: string | null
  }
}

function parseDate(s: string): Date | null {
  if (!s) return null
  // Accept YYYY-MM-DD (preferred) and DD/MM/YYYY (Excel default in pt-PT).
  let iso = s
  const ptMatch = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s)
  if (ptMatch) {
    iso = `${ptMatch[3]}-${ptMatch[2]!.padStart(2, '0')}-${ptMatch[1]!.padStart(2, '0')}`
  }
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d : null
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'inquerito:bulk:all')) {
      return apiError('Sem permissão para importar inquéritos', 403)
    }

    const limited = enforceRateLimit({
      key: `inquerito:import:${clientFingerprint(req)}:${session.user.id}`,
      ...RATE_LIMITS.HEAVY_OPERATIONS,
    })
    if (limited) return limited

    const body = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)
    const { csv, confirm } = parsed.data

    // ─ Parse CSV ────────────────────────────────────────────────────────────
    let headers: string[]
    let raw: Record<string, string>[]
    try {
      ;({ headers, rows: raw } = parseCSVWithHeader(csv))
    } catch (e) {
      return apiError(
        e instanceof Error ? e.message : 'CSV inválido',
        400,
      )
    }
    if (raw.length === 0) return apiError('CSV sem linhas de dados', 400)
    if (raw.length > MAX_ROWS) {
      return apiError(`Demasiadas linhas (limite ${MAX_ROWS})`, 400)
    }
    const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h))
    if (missing.length > 0) {
      return apiError(`Colunas em falta: ${missing.join(', ')}`, 400)
    }

    // ─ Hydrate catalogue tables once for fast lookups ───────────────────────
    const [estados, brigadas, crimes, existingNuipcs, existingNais, inspetores] = await Promise.all([
      prisma.estadoInquerito.findMany({
        where: { ativo: true },
        select: { id: true, codigo: true, nome: true, terminal: true },
      }),
      prisma.brigada.findMany({
        where: { ativa: true },
        select: { id: true, nome: true },
      }),
      prisma.crime.findMany({
        where: { ativo: true },
        select: { id: true, nome: true },
      }),
      prisma.inquerito
        .findMany({
          where: {
            nuipc: { in: raw.map((r) => (r['NUIPC'] ?? '').trim()).filter(Boolean) },
          },
          select: { nuipc: true },
        })
        .then((rows) => new Set(rows.map((r) => r.nuipc))),
      prisma.inquerito
        .findMany({
          where: {
            nai: { in: raw.map((r) => (r['NAI'] ?? '').trim()).filter(Boolean) },
          },
          select: { nai: true },
        })
        .then((rows) => new Set(rows.map((r) => r.nai).filter(Boolean) as string[])),
      prisma.utilizador.findMany({
        where: { ativo: true, role: { in: ['INSPETOR', 'INSPETOR_CHEFE'] } },
        select: { id: true, email: true, brigadaId: true },
      }),
    ])

    const estadoByCodigo = new Map(estados.map((e) => [e.codigo.toUpperCase(), e]))
    const estadoByNome = new Map(estados.map((e) => [e.nome.toLowerCase(), e]))
    // Default estado: first active non-terminal estado (fallback when column omitted)
    const defaultEstado = estados.find((e) => !e.terminal) ?? null

    const brigadaByNome = new Map(brigadas.map((b) => [b.nome.toLowerCase(), b]))
    const brigadaById = new Map(brigadas.map((b) => [b.id, b]))
    // Fallback brigade: the importing user's own brigade (if assigned)
    const defaultBrigada = session.user.brigadaId
      ? (brigadaById.get(session.user.brigadaId) ?? null)
      : null

    const crimeByNome = new Map(crimes.map((c) => [c.nome.toLowerCase(), c]))
    const inspetorByEmail = new Map(inspetores.map((u) => [u.email.toLowerCase(), u]))

    // ─ Validate per row ─────────────────────────────────────────────────────
    const seenNuipcs = new Set<string>()
    const seenNais = new Set<string>()
    const validated: ValidatedRow[] = raw.map((cells, idx) => {
      const line = idx + 2 // 1 is the header
      const errors: string[] = []
      const get = (k: AllHeaders) => (cells[k] ?? '').trim()

      // — NUIPC (required) — normalised to uppercase to ensure consistent DB checks
      const nuipc = get('NUIPC').toUpperCase()
      if (!nuipc) errors.push('NUIPC obrigatório')
      else if (!NUIPC_REGEX.test(nuipc)) errors.push('NUIPC com formato inválido')
      else if (seenNuipcs.has(nuipc)) errors.push('NUIPC duplicado no ficheiro')
      else if (existingNuipcs.has(nuipc)) errors.push('NUIPC já existe na base de dados')
      else seenNuipcs.add(nuipc)

      // — NAI (required) —
      const nai = get('NAI')
      if (!nai) errors.push('NAI obrigatória')
      else if (seenNais.has(nai)) errors.push('NAI duplicada no ficheiro')
      else if (existingNais.has(nai)) errors.push('NAI já existe na base de dados')
      else seenNais.add(nai)

      // — Crime (optional) —
      const crimeNome = get('Crime')
      const crime = crimeNome ? crimeByNome.get(crimeNome.toLowerCase()) : null
      if (crimeNome && !crime) errors.push(`Crime «${crimeNome}» não existe no catálogo`)

      // — Estado (optional, defaults to first active non-terminal) —
      const estadoText = get('Estado')
      let estado = estadoByCodigo.get(estadoText.toUpperCase())
      if (!estado) estado = estadoByNome.get(estadoText.toLowerCase())
      if (estadoText && !estado) {
        errors.push(`Estado «${estadoText}» não existe ou está inativo`)
      } else if (!estadoText && !defaultEstado) {
        errors.push('Estado obrigatório (sem estado ativo disponível no sistema)')
      }
      const effectiveEstado = estado ?? defaultEstado

      // — Data Abertura (optional, defaults to today) —
      const dataAberturaStr = get('Data Abertura')
      const dataAbertura = dataAberturaStr ? parseDate(dataAberturaStr) : new Date()
      if (dataAberturaStr && !dataAbertura) {
        errors.push(`Data de abertura inválida «${dataAberturaStr}»`)
      }

      // — Brigada (optional, defaults to importing user's brigade, can be null) —
      const brigadaNome = get('Brigada')
      let brigada = brigadaNome ? brigadaByNome.get(brigadaNome.toLowerCase()) : null
      if (brigadaNome && !brigada) {
        errors.push(`Brigada «${brigadaNome}» não existe ou está inativa`)
      } else if (!brigadaNome) {
        brigada = defaultBrigada // may be null — that is allowed
      }

      // — Prazo / Data Conclusão —
      const prazoStr = get('Prazo')
      const dataPrazo = prazoStr ? parseDate(prazoStr) : null
      if (prazoStr && !dataPrazo) errors.push(`Prazo inválido «${prazoStr}»`)
      if (dataAbertura && dataPrazo && dataPrazo < dataAbertura) {
        errors.push('Prazo anterior à data de abertura')
      }

      const conclusaoStr = get('Data Conclusão')
      const dataConclusao = conclusaoStr ? parseDate(conclusaoStr) : null
      if (conclusaoStr && !dataConclusao) {
        errors.push(`Data de conclusão inválida «${conclusaoStr}»`)
      }
      if (dataAbertura && dataConclusao && dataConclusao < dataAbertura) {
        errors.push('Data de conclusão anterior à data de abertura')
      }
      if (effectiveEstado && effectiveEstado.terminal && !dataConclusao) {
        errors.push('Estado terminal exige data de conclusão')
      }
      if (effectiveEstado && !effectiveEstado.terminal && dataConclusao) {
        errors.push('Data de conclusão só se aplica a estados terminais')
      }

      // — Inspetor —
      const inspetorEmail = get('Inspetor (email)').toLowerCase() || ''
      let inspetorId: string | null = null
      if (inspetorEmail) {
        const u = inspetorByEmail.get(inspetorEmail)
        if (!u) errors.push(`Inspetor «${inspetorEmail}» não existe ou está inativo`)
        else if (brigada && u.brigadaId !== brigada.id) {
          errors.push(`Inspetor «${inspetorEmail}» não pertence à brigada «${brigada.nome}»`)
        } else {
          inspetorId = u.id
        }
      }

      // — Outros campos opcionais —
      const tribunal = get('Tribunal') || null
      const procurador = get('Procurador') || null
      const oficialJustica = get('Oficial de Justiça') || null
      const voip = get('VoIP') || null
      const notasTribunal = get('Notas Tribunal') || null
      const notas = get('Notas') || null

      // — Denunciante —
      const denuncianteNome = get('Denunciante Nome') || null
      const denuncianteTipo = get('Denunciante Tipo') || null
      const denuncianteNif = get('Denunciante NIF') || null
      const denuncianteMorada = get('Denunciante Morada') || null
      const denuncianteCodPostal = get('Denunciante Cód. Postal') || null
      const denuncianteLocalidade = get('Denunciante Localidade') || null
      const denuncianteContacto = get('Denunciante Contacto') || null
      const denuncianteEmail = get('Denunciante Email') || null
      const denuncianteResponsavel = get('Denunciante Responsável') || null
      const denuncianteNotas = get('Denunciante Notas') || null

      const result: ValidatedRow = { line, raw: cells, errors }
      if (errors.length === 0 && effectiveEstado && dataAbertura) {
        result.payload = {
          nuipc,
          nai,
          crimeId: crime?.id ?? null,
          crimeNome: crime?.nome ?? '',
          estadoId: effectiveEstado.id,
          estadoCodigo: effectiveEstado.codigo,
          estadoTerminal: effectiveEstado.terminal,
          dataAbertura,
          dataPrazo,
          dataConclusao,
          brigadaId: brigada?.id ?? null,
          brigadaNome: brigada?.nome ?? null,
          inspetorId,
          inspetorEmail: inspetorEmail || null,
          tribunal,
          procurador,
          oficialJustica,
          voip,
          notasTribunal,
          notas,
          denuncianteNome,
          denuncianteTipo,
          denuncianteNif,
          denuncianteMorada,
          denuncianteCodPostal,
          denuncianteLocalidade,
          denuncianteContacto,
          denuncianteEmail,
          denuncianteResponsavel,
          denuncianteNotas,
        }
      }
      return result
    })

    const okCount = validated.filter((r) => r.errors.length === 0).length
    const errorCount = validated.length - okCount

    // Build the response report (no payload — that stays server-side)
    const report = {
      headers,
      totalRows: validated.length,
      okCount,
      errorCount,
      canCommit: errorCount === 0 && okCount > 0,
      rows: validated.map((r) => ({
        line: r.line,
        nuipc: r.raw['NUIPC'] ?? '',
        nai: r.raw['NAI'] ?? '',
        crime: r.raw['Crime'] ?? '',
        brigada: r.raw['Brigada'] ?? '',
        inspetor: r.raw['Inspetor (email)'] ?? '',
        estado: r.raw['Estado'] ?? '',
        dataAbertura: r.raw['Data Abertura'] ?? '',
        errors: r.errors,
      })),
    }

    if (!confirm) {
      return Response.json(report)
    }

    if (!report.canCommit) {
      return apiError(
        `Importação rejeitada: ${errorCount} linha(s) com erro. Corrija o ficheiro e volte a tentar.`,
        400,
      )
    }

    // ─ Commit ───────────────────────────────────────────────────────────────
    const valid = validated.filter((r) => r.payload).map((r) => r.payload!)
    const userId = session.user.id

    await prisma.$transaction(async (tx) => {
      await tx.inquerito.createMany({
        data: valid.map((v) => ({
          nuipc: v.nuipc,
          nai: v.nai,
          natureza: v.crimeNome,
          crimeId: v.crimeId,
          estadoId: v.estadoId,
          dataAbertura: v.dataAbertura,
          dataPrazo: v.dataPrazo,
          dataConclusao: v.dataConclusao,
          notas: v.notas,
          brigadaId: v.brigadaId,
          inspetorId: v.inspetorId,
          tribunal: v.tribunal,
          procurador: v.procurador,
          oficialJustica: v.oficialJustica,
          voip: v.voip,
          notasTribunal: v.notasTribunal,
          denuncianteNome: v.denuncianteNome,
          denuncianteTipo: v.denuncianteTipo,
          denuncianteNif: v.denuncianteNif,
          denuncianteMorada: v.denuncianteMorada,
          denuncianteCodPostal: v.denuncianteCodPostal,
          denuncianteLocalidade: v.denuncianteLocalidade,
          denuncianteContacto: v.denuncianteContacto,
          denuncianteEmail: v.denuncianteEmail,
          denuncianteResponsavel: v.denuncianteResponsavel,
          denuncianteNotas: v.denuncianteNotas,
        })),
      })

      const created = await tx.inquerito.findMany({
        where: { nuipc: { in: valid.map((v) => v.nuipc) } },
        select: { id: true, nuipc: true, brigadaId: true, inspetorId: true },
      })
      const idByNuipc = new Map(created.map((c) => [c.nuipc, c.id]))

      await tx.auditLog.createMany({
        data: valid.map((v) => ({
          acao: 'CREATE_INQUERITO',
          entidade: 'Inquerito',
          entidadeId: idByNuipc.get(v.nuipc)!,
          utilizadorId: userId,
          detalhes: {
            nuipc: v.nuipc,
            crimeNome: v.crimeNome,
            estadoCodigo: v.estadoCodigo,
            brigadaId: v.brigadaId,
            inspetorId: v.inspetorId,
            source: 'bulk_import',
          } as never,
        })),
      })
    })

    await writeAudit({
      req,
      acao: 'BULK_IMPORT_INQUERITOS',
      entidade: 'Inquerito',
      entidadeId: '__bulk_import__',
      utilizadorId: userId,
      detalhes: { imported: valid.length },
    })

    revalidatePath('/inqueritos')
    revalidatePath('/dashboard')

    return Response.json({ ...report, committed: valid.length })
  } catch (error) {
    return handleApiError(error)
  }
}

// Template CSV for users to download / fill in.
// Includes all importable fields (REQUIRED + OPTIONAL), excluding unified
// fields: natureza (unified with Crime), internal IDs and system timestamps.
export async function GET() {
  const allHeaders = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]
  const example: string[] = [
    '2024/000999/YUSTR', // NUIPC
    'NAI-2024-999',      // NAI
    'Furto qualificado', // Crime
    'ABERTO',            // Estado
    '2024-10-15',        // Data Abertura
    'Brigada Alfa',      // Brigada
    '2025-04-15',        // Prazo
    '',                  // Data Conclusão
    'inspetor@gpi.pt',   // Inspetor (email)
    'Tribunal Judicial de Lisboa', // Tribunal
    'Dra. Maria Silva',  // Procurador
    'Sr. João Costa',    // Oficial de Justiça
    '+351 21 000 0000',  // VoIP
    'Despacho aguardado', // Notas Tribunal
    'Furto em residência', // Notas
    'João Manuel Silva', // Denunciante Nome
    'SINGULAR',          // Denunciante Tipo
    '123456789',         // Denunciante NIF
    'Rua das Flores, 10', // Denunciante Morada
    '1000-001',          // Denunciante Cód. Postal
    'Lisboa',            // Denunciante Localidade
    '+351 91 000 0000',  // Denunciante Contacto
    'joao.silva@email.pt', // Denunciante Email
    '',                  // Denunciante Responsável
    '',                  // Denunciante Notas
  ]
  const escapeCell = (v: string) =>
    v.includes(',') || v.includes('"') || v.includes('\n')
      ? `"${v.replace(/"/g, '""')}"`
      : v
  const csv =
    '﻿' +
    allHeaders.map(escapeCell).join(',') +
    '\n' +
    example.map(escapeCell).join(',') +
    '\n'
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="modelo-import-inqueritos.csv"',
    },
  })
}
