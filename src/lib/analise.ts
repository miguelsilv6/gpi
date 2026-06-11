import { prisma } from '@/lib/prisma'

/**
 * Métricas analíticas de desempenho calculadas sobre os inquéritos:
 * tempo de resolução, taxa de cumprimento de prazo e tendência mensal.
 * Tudo deriva de dados existentes (dataAbertura/dataConclusao/dataPrazo) —
 * nenhuma alteração de schema.
 */

export interface AnaliseMensal {
  mes: string // "2026-01" → label "jan 26" calculado na UI
  abertos: number
  concluidos: number
}

export interface AnaliseBucket {
  label: string
  count: number
}

export interface AnaliseResult {
  ativos: number
  concluidos12m: number
  vencidosHoje: number
  /** Média de dias entre abertura e conclusão (últimos 12 meses). */
  tempoMedioResolucaoDias: number | null
  /** % de concluídos (12m, com prazo definido) fechados dentro do prazo. */
  taxaDentroPrazo: number | null
  trendMensal: AnaliseMensal[]
  distribuicaoResolucao: AnaliseBucket[]
}

const BUCKETS: { label: string; max: number }[] = [
  { label: '< 30 dias', max: 30 },
  { label: '30–90 dias', max: 90 },
  { label: '90–180 dias', max: 180 },
  { label: '180–365 dias', max: 365 },
  { label: '> 1 ano', max: Infinity },
]

export async function computeAnalise(brigadaId: string | null): Promise<AnaliseResult> {
  const hoje = new Date()
  const inicio12m = new Date(hoje)
  inicio12m.setMonth(inicio12m.getMonth() - 11)
  inicio12m.setDate(1)
  inicio12m.setHours(0, 0, 0, 0)

  const scope = brigadaId ? { brigadaId } : {}

  const [ativos, vencidosHoje, concluidos, abertos12m] = await Promise.all([
    prisma.inquerito.count({
      where: { ...scope, deletedAt: null, estado: { terminal: false } },
    }),
    prisma.inquerito.count({
      where: {
        ...scope,
        deletedAt: null,
        estado: { terminal: false },
        dataPrazo: { lt: hoje },
      },
    }),
    // Concluídos nos últimos 12 meses, com as datas precisas para métricas.
    prisma.inquerito.findMany({
      where: {
        ...scope,
        deletedAt: null,
        dataConclusao: { gte: inicio12m },
      },
      select: { dataAbertura: true, dataConclusao: true, dataPrazo: true },
    }),
    prisma.inquerito.findMany({
      where: {
        ...scope,
        deletedAt: null,
        dataAbertura: { gte: inicio12m },
      },
      select: { dataAbertura: true },
    }),
  ])

  // Tempo médio de resolução + distribuição em buckets.
  let somaDias = 0
  let comTempoCount = 0
  const bucketCounts = BUCKETS.map(() => 0)
  let dentroPrazo = 0
  let comPrazoCount = 0

  for (const inq of concluidos) {
    if (!inq.dataConclusao) continue
    const dias = Math.max(0, Math.round(
      (inq.dataConclusao.getTime() - inq.dataAbertura.getTime()) / 86_400_000,
    ))
    somaDias += dias
    comTempoCount++
    const idx = BUCKETS.findIndex((b) => dias < b.max)
    bucketCounts[idx === -1 ? BUCKETS.length - 1 : idx]++

    if (inq.dataPrazo) {
      comPrazoCount++
      if (inq.dataConclusao <= inq.dataPrazo) dentroPrazo++
    }
  }

  // Tendência mensal: 12 meses, abertos vs concluídos.
  const meses: AnaliseMensal[] = []
  const cursor = new Date(inicio12m)
  for (let i = 0; i < 12; i++) {
    meses.push({
      mes: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      abertos: 0,
      concluidos: 0,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  const mesIndex = new Map(meses.map((m, i) => [m.mes, i]))
  const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

  for (const inq of abertos12m) {
    const idx = mesIndex.get(keyOf(inq.dataAbertura))
    if (idx !== undefined) meses[idx].abertos++
  }
  for (const inq of concluidos) {
    if (!inq.dataConclusao) continue
    const idx = mesIndex.get(keyOf(inq.dataConclusao))
    if (idx !== undefined) meses[idx].concluidos++
  }

  return {
    ativos,
    concluidos12m: comTempoCount,
    vencidosHoje,
    tempoMedioResolucaoDias: comTempoCount > 0 ? Math.round(somaDias / comTempoCount) : null,
    taxaDentroPrazo: comPrazoCount > 0 ? Math.round((dentroPrazo / comPrazoCount) * 100) : null,
    trendMensal: meses,
    distribuicaoResolucao: BUCKETS.map((b, i) => ({ label: b.label, count: bucketCounts[i] })),
  }
}
