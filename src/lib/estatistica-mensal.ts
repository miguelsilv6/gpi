import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'

export interface EstatisticaMensalData {
  ano: number
  mes: number
  atividadesPadrao: { id: string; nome: string }[]
  brigadas: { id: string; nome: string }[]
  /** counts[padraoNome][brigadaId] = count */
  counts: Record<string, Record<string, number>>
  totalGeral: number
}

interface BuildOpts {
  ano: number
  mes: number
  role: Role
  sessionBrigadaId: string | null
}

/**
 * Returns null when the user is INSPETOR_CHEFE without a brigada (misconfiguration).
 * Caller should translate that into a 403.
 */
export async function buildEstatisticaMensal(
  opts: BuildOpts,
): Promise<EstatisticaMensalData | null> {
  const { ano, mes, role, sessionBrigadaId } = opts

  const lockedBrigadaId = role === 'INSPETOR_CHEFE' ? sessionBrigadaId : null
  if (role === 'INSPETOR_CHEFE' && !lockedBrigadaId) return null

  const startDate = new Date(Date.UTC(ano, mes - 1, 1))
  const endDate = new Date(Date.UTC(ano, mes, 1))

  const [atividadesPadrao, brigadas] = await Promise.all([
    prisma.atividadePadrao.findMany({
      where: { ativa: true, contaParaEstatistica: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true },
    }),
    prisma.brigada.findMany({
      where: {
        ativa: true,
        ...(lockedBrigadaId ? { id: lockedBrigadaId } : {}),
      },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
  ])

  const padraoNomes = atividadesPadrao.map((p) => p.nome)
  const brigadaIds = new Set(brigadas.map((b) => b.id))

  const counts: Record<string, Record<string, number>> = {}
  for (const p of atividadesPadrao) {
    counts[p.nome] = {}
    for (const b of brigadas) counts[p.nome][b.id] = 0
  }

  let totalGeral = 0

  if (padraoNomes.length > 0 && brigadas.length > 0) {
    const atividades = await prisma.atividade.findMany({
      where: {
        descricao: { in: padraoNomes },
        dataRealizacao: { gte: startDate, lt: endDate },
        inquerito: {
          deletedAt: null,
          ...(lockedBrigadaId ? { brigadaId: lockedBrigadaId } : {}),
        },
      },
      select: {
        descricao: true,
        inquerito: { select: { brigadaId: true } },
      },
    })

    for (const a of atividades) {
      const brigadaId = a.inquerito.brigadaId
      if (!brigadaIds.has(brigadaId)) continue
      const row = counts[a.descricao]
      if (!row) continue
      row[brigadaId] = (row[brigadaId] ?? 0) + 1
      totalGeral++
    }
  }

  return { ano, mes, atividadesPadrao, brigadas, counts, totalGeral }
}

const MES_LABEL_PT: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
  5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
  9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}

export function getMesLabel(mes: number): string {
  return MES_LABEL_PT[mes] ?? String(mes)
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Returns { rowTotals, colTotals } over the counts matrix. */
function computeTotals(data: EstatisticaMensalData) {
  const rowTotals: Record<string, number> = {}
  const colTotals: Record<string, number> = {}
  for (const p of data.atividadesPadrao) {
    let row = 0
    for (const b of data.brigadas) {
      const v = data.counts[p.nome]?.[b.id] ?? 0
      row += v
      colTotals[b.id] = (colTotals[b.id] ?? 0) + v
    }
    rowTotals[p.nome] = row
  }
  return { rowTotals, colTotals }
}

export function formatEstatisticaMensalCSV(data: EstatisticaMensalData): string {
  const { rowTotals, colTotals } = computeTotals(data)
  const headers = ['Atividade Padrão', ...data.brigadas.map((b) => b.nome), 'Total']
  const lines: string[] = [headers.map(escapeCSV).join(',')]

  for (const p of data.atividadesPadrao) {
    const row = [
      p.nome,
      ...data.brigadas.map((b) => data.counts[p.nome]?.[b.id] ?? 0),
      rowTotals[p.nome] ?? 0,
    ]
    lines.push(row.map(escapeCSV).join(','))
  }

  const totalRow = [
    'Total',
    ...data.brigadas.map((b) => colTotals[b.id] ?? 0),
    data.totalGeral,
  ]
  lines.push(totalRow.map(escapeCSV).join(','))

  return lines.join('\n')
}

function mdEscape(s: string): string {
  return s.replace(/\|/g, '\\|')
}

export function formatEstatisticaMensalMarkdown(data: EstatisticaMensalData): string {
  const { rowTotals, colTotals } = computeTotals(data)
  const title = `# Estatística Mensal — ${getMesLabel(data.mes)} ${data.ano}`
  const headers = ['Atividade Padrão', ...data.brigadas.map((b) => b.nome), 'Total']

  if (data.atividadesPadrao.length === 0 || data.brigadas.length === 0) {
    return `${title}\n\n_Sem dados a apresentar._\n`
  }

  const separator = headers.map((_, i) => (i === 0 ? ':---' : '---:')).join(' | ')
  const lines: string[] = [
    title,
    '',
    `Total geral: **${data.totalGeral}**`,
    '',
    `| ${headers.map(mdEscape).join(' | ')} |`,
    `| ${separator} |`,
  ]

  for (const p of data.atividadesPadrao) {
    const cells = [
      mdEscape(p.nome),
      ...data.brigadas.map((b) => String(data.counts[p.nome]?.[b.id] ?? 0)),
      String(rowTotals[p.nome] ?? 0),
    ]
    lines.push(`| ${cells.join(' | ')} |`)
  }

  const totalRow = [
    '**Total**',
    ...data.brigadas.map((b) => `**${colTotals[b.id] ?? 0}**`),
    `**${data.totalGeral}**`,
  ]
  lines.push(`| ${totalRow.join(' | ')} |`)

  return lines.join('\n') + '\n'
}
