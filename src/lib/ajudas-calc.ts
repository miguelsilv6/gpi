import type { AjudasPrevencao } from '@/generated/prisma/enums'

export interface HoursSplit {
  semanaDia: number    // weekday 08:00-24:00
  semanaNoite: number  // weekday 00:00-08:00
  fdsDia: number       // weekend/holiday 08:00-24:00
  fdsNoite: number     // weekend/holiday 00:00-08:00
}

export interface AjudasTotais {
  // Overtime hours
  semanaDia: number
  semanaNoite: number
  fdsDia: number
  fdsNoite: number
  // Rates
  taxaSemanaDia: number
  taxaSemanaNoite: number
  taxaFdsDia: number
  taxaFdsNoite: number
  // Overtime subtotals
  totalSemanaDia: number
  totalSemanaNoite: number
  totalFdsDia: number
  totalFdsNoite: number
  totalHorasExtra: number
  // Piquete
  piqueteSemana: number
  piqueteFds: number
  taxaPiqueteSemana: number
  taxaPiqueteFds: number
  totalPiqueteSemana: number
  totalPiqueteFds: number
  totalPiquete: number
  // Prevenção Passiva
  prevencaoSemana: number
  prevencaoFds: number
  taxaPrevencaoSemana: number
  taxaPrevencaoFds: number
  totalPrevencaoSemana: number
  totalPrevencaoFds: number
  totalPrevencao: number
  // Ajudas de custo
  ajudaCustoAlmoco: number
  ajudaCustoJantar: number
  ajudaCustoAlojamento: number
  taxaAjudaAlmoco: number
  taxaAjudaJantar: number
  taxaAjudaAlojamento: number
  totalAjudasCusto: number
  // Senhas
  senhaAlmoco: number
  senhaJantar: number
  senhaCeia: number
  taxaSenhaAlmoco: number
  taxaSenhaJantar: number
  taxaSenhaCeia: number
  totalSenhas: number
  // Deductions
  baseImponivel: number
  irs: number
  ss: number
  // Final
  totalBruto: number
  liquido: number
  // Limits
  limiteBase: number
  limiteMensal: number
  totalContaLimite: number
  emFalta: number
  percentCompleto: number
}

export interface ConfigData {
  vencimentoBase: number
  vencimentoDN: number
  percentPiqueteSemana: number
  percentPiqueteFds: number
  percentPrevencaoPassiva: number
  ajudaCustoMaxDiario: number
  senhaAlmoco: number
  senhaJantar: number
  senhaCeia: number
  taxaIRS: number
  taxaSS: number
  distanciaMinKmAjudas: number
}

export interface LinhaWithData {
  dataInicio: Date
  dataFim: Date
  prevencao: AjudasPrevencao
  prevencaoOnly: boolean
  ajudaCustoAlmoco: number
  ajudaCustoJantar: number
  ajudaCustoAlojamento: number
  senhaAlmoco: number
  senhaJantar: number
  senhaCeia: number
  km: number
}

/**
 * Returns Portuguese fixed and moveable holidays for the given year as 'YYYY-MM-DD' strings.
 * Uses Meeus/Jones/Butcher algorithm for Easter.
 */
export function getPortugueseHolidays(year: number): Set<string> {
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

  // Fixed holidays
  const holidays = new Set<string>([
    fmt(year, 1, 1),   // Ano Novo
    fmt(year, 4, 25),  // Dia da Liberdade
    fmt(year, 5, 1),   // Dia do Trabalho
    fmt(year, 6, 10),  // Dia de Portugal
    fmt(year, 8, 15),  // Assunção de Nossa Senhora
    fmt(year, 10, 5),  // Implantação da República
    fmt(year, 11, 1),  // Todos os Santos
    fmt(year, 12, 1),  // Restauração da Independência
    fmt(year, 12, 8),  // Imaculada Conceição
    fmt(year, 12, 25), // Natal
  ])

  // Meeus/Jones/Butcher Easter algorithm
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31)
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1

  const easterDate = new Date(year, easterMonth - 1, easterDay)

  // Good Friday = Easter - 2 days
  const goodFriday = new Date(easterDate)
  goodFriday.setDate(goodFriday.getDate() - 2)
  holidays.add(fmt(goodFriday.getFullYear(), goodFriday.getMonth() + 1, goodFriday.getDate()))

  // Corpus Christi = Easter + 60 days
  const corpusChristi = new Date(easterDate)
  corpusChristi.setDate(corpusChristi.getDate() + 60)
  holidays.add(fmt(corpusChristi.getFullYear(), corpusChristi.getMonth() + 1, corpusChristi.getDate()))

  return holidays
}

// Regular working hours on weekdays: 09:00–17:30 (in minutes from midnight)
const WORK_START_MINS = 9 * 60        //  540 min
const WORK_END_MINS   = 17 * 60 + 30  // 1050 min

// All time operations use Europe/Lisbon to ensure correct DST handling regardless
// of the server's process timezone (UTC on most cloud platforms).
const LISBON_TZ = 'Europe/Lisbon'

function lisbonComponents(d: Date): {
  year: number; month: number; day: number
  hour: number; minute: number
  dayOfWeek: number; dateStr: string
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LISBON_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0', 10)
  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = get('hour')
  const minute = get('minute')
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${year}-${pad2(month)}-${pad2(day)}`
  // Derive day-of-week from the Lisbon calendar date using midday UTC (safe across all TZ)
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay()
  return { year, month, day, hour, minute, dayOfWeek, dateStr }
}

/** Converts a Lisbon wall-clock date/time to the corresponding UTC Date. */
function lisbonWallToUTC(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Approximate in UTC, then correct for the timezone offset at that instant
  const approx = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
  const comp = lisbonComponents(approx)
  const diffMin = (comp.hour - hour) * 60 + (comp.minute - minute)
  return new Date(approx.getTime() - diffMin * 60_000)
}

/**
 * Splits hours between start and end into 4 buckets (weekday/weekend × day/night).
 * Hour slots: 00-07 = night (0h-7h59), 08-23 = day (8h00-23h59).
 * Weekend = Saturday (6), Sunday (0), or holiday.
 *
 * Weekday hours inside the regular working window (09:00–17:30) are excluded
 * from overtime — they are normal paid working time and do not count towards
 * extra pay. Weekend/holiday hours are never excluded.
 *
 * All boundary and classification logic uses Europe/Lisbon time.
 */
export function splitHours(start: Date, end: Date, holidays: Set<string>): HoursSplit {
  const result: HoursSplit = { semanaDia: 0, semanaNoite: 0, fdsDia: 0, fdsNoite: 0 }

  if (start >= end) return result

  let current = new Date(start.getTime())

  while (current < end) {
    const { year, month, day, hour, minute, dayOfWeek, dateStr } = lisbonComponents(current)
    const curMins = hour * 60 + minute

    // Next hour boundary in Lisbon time, expressed as UTC
    const nextHour = lisbonWallToUTC(year, month, day, hour + 1, 0)

    const boundaries: Date[] = [nextHour]

    const today0900 = lisbonWallToUTC(year, month, day, 9, 0)
    if (today0900 > current && today0900 < nextHour) boundaries.push(today0900)

    const today1730 = lisbonWallToUTC(year, month, day, 17, 30)
    if (today1730 > current && today1730 < nextHour) boundaries.push(today1730)

    boundaries.sort((a, b) => a.getTime() - b.getTime())
    const segmentEnd = boundaries[0]! < end ? boundaries[0]! : end

    const durationHours = (segmentEnd.getTime() - current.getTime()) / 3_600_000

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 || holidays.has(dateStr)
    const isNight = hour < 8

    // Skip regular working hours on weekdays (not applicable on weekends/holidays)
    const isWorkingTime = !isWeekend && curMins >= WORK_START_MINS && curMins < WORK_END_MINS

    if (!isWorkingTime) {
      if (isWeekend) {
        if (isNight) result.fdsNoite += durationHours
        else result.fdsDia += durationHours
      } else {
        if (isNight) result.semanaNoite += durationHours
        else result.semanaDia += durationHours
      }
    }

    current = segmentEnd
  }

  return result
}

/**
 * Calculates all totals for a month's ajudas record.
 * vencimentoBase and taxaIRS must be the user's personal configured values.
 */
export function calcAjudasTotais(linhas: LinhaWithData[], config: ConfigData, vencimentoBase: number, taxaIRS: number): AjudasTotais {
  // Gather all years from the data to compute holidays
  const years = new Set<number>()
  for (const l of linhas) {
    years.add(new Date(l.dataInicio).getFullYear())
    years.add(new Date(l.dataFim).getFullYear())
  }
  // Build a combined holiday set
  const allHolidays = new Set<string>()
  for (const y of years) {
    for (const h of getPortugueseHolidays(y)) {
      allHolidays.add(h)
    }
  }

  // Accumulators
  let semanaDia = 0
  let semanaNoite = 0
  let fdsDia = 0
  let fdsNoite = 0

  let piqueteSemana = 0
  let piqueteFds = 0
  let prevencaoSemana = 0
  let prevencaoFds = 0

  let ajudaCustoAlmoco = 0
  let ajudaCustoJantar = 0
  let ajudaCustoAlojamento = 0
  let senhaAlmoco = 0
  let senhaJantar = 0
  let senhaCeia = 0

  const fmtDate = (d: Date) => lisbonComponents(d).dateStr

  function isFdsDay(d: Date): boolean {
    const { dayOfWeek, dateStr } = lisbonComponents(d)
    return dayOfWeek === 0 || dayOfWeek === 6 || allHolidays.has(dateStr)
  }

  for (const linha of linhas) {
    const inicio = new Date(linha.dataInicio)
    const fim = new Date(linha.dataFim)

    // prevencaoOnly entries record only the prevencao fee — skip hour calculation
    if (!linha.prevencaoOnly) {
      const split = splitHours(inicio, fim, allHolidays)
      semanaDia += split.semanaDia
      semanaNoite += split.semanaNoite
      fdsDia += split.fdsDia
      fdsNoite += split.fdsNoite
    }

    // Prevenção / Piquete — count one entry per line, classify by dataInicio day
    if (linha.prevencao === 'PIQUETE') {
      if (isFdsDay(inicio)) piqueteFds += 1
      else piqueteSemana += 1
    } else if (linha.prevencao === 'PREVENCAO_PASSIVA') {
      if (isFdsDay(inicio)) prevencaoFds += 1
      else prevencaoSemana += 1
    }

    // Ajudas de custo: only applicable when km >= distanciaMinKmAjudas
    if (linha.km >= config.distanciaMinKmAjudas) {
      ajudaCustoAlmoco += linha.ajudaCustoAlmoco
      ajudaCustoJantar += linha.ajudaCustoJantar
      ajudaCustoAlojamento += linha.ajudaCustoAlojamento
    }

    // Senhas always apply
    senhaAlmoco += linha.senhaAlmoco
    senhaJantar += linha.senhaJantar
    senhaCeia += linha.senhaCeia
  }

  // --- Rates calculation ---
  // Overtime rates derived from piquete percentages
  const taxaSemanaDia = (vencimentoBase * config.percentPiqueteSemana) / 12
  const taxaSemanaNoite = taxaSemanaDia * 2
  const taxaFdsDia = (vencimentoBase * config.percentPiqueteFds) / 12
  const taxaFdsNoite = taxaFdsDia * 2

  // Piquete rates: full monthly allowance per piquete entry
  const taxaPiqueteSemana = vencimentoBase * config.percentPiqueteSemana
  const taxaPiqueteFds = vencimentoBase * config.percentPiqueteFds

  // Prevenção passiva rates
  const taxaPrevencaoSemana = vencimentoBase * config.percentPrevencaoPassiva / 3
  const taxaPrevencaoFds = vencimentoBase * config.percentPrevencaoPassiva / 3 * 1.265

  // Ajudas de custo rates
  const taxaAjudaAlmoco = config.ajudaCustoMaxDiario * 0.25 - 6
  const taxaAjudaJantar = config.ajudaCustoMaxDiario * 0.25
  const taxaAjudaAlojamento = config.ajudaCustoMaxDiario * 0.5

  // --- Subtotals ---
  const totalSemanaDia = semanaDia * taxaSemanaDia
  const totalSemanaNoite = semanaNoite * taxaSemanaNoite
  const totalFdsDia = fdsDia * taxaFdsDia
  const totalFdsNoite = fdsNoite * taxaFdsNoite
  const totalHorasExtra = totalSemanaDia + totalSemanaNoite + totalFdsDia + totalFdsNoite

  const totalPiqueteSemana = piqueteSemana * taxaPiqueteSemana
  const totalPiqueteFds = piqueteFds * taxaPiqueteFds
  const totalPiquete = totalPiqueteSemana + totalPiqueteFds

  const totalPrevencaoSemana = prevencaoSemana * taxaPrevencaoSemana
  const totalPrevencaoFds = prevencaoFds * taxaPrevencaoFds
  const totalPrevencao = totalPrevencaoSemana + totalPrevencaoFds

  const totalAjudasCusto =
    ajudaCustoAlmoco * taxaAjudaAlmoco +
    ajudaCustoJantar * taxaAjudaJantar +
    ajudaCustoAlojamento * taxaAjudaAlojamento

  const totalSenhas =
    senhaAlmoco * config.senhaAlmoco +
    senhaJantar * config.senhaJantar +
    senhaCeia * config.senhaCeia

  // --- Final calculations ---
  const baseImponivel = totalHorasExtra + totalPiquete + totalPrevencao
  const irs = baseImponivel * taxaIRS
  const ss = baseImponivel * config.taxaSS
  const totalBruto = baseImponivel + totalAjudasCusto + totalSenhas
  const liquido = totalBruto - irs - ss

  // Limits
  const limiteBase = vencimentoBase
  const limiteMensal = vencimentoBase / 3
  const totalContaLimite = baseImponivel
  const emFalta = Math.max(0, limiteMensal - totalContaLimite)
  const percentCompleto = limiteMensal > 0
    ? Math.min(1, totalContaLimite / limiteMensal)
    : 0

  return {
    semanaDia,
    semanaNoite,
    fdsDia,
    fdsNoite,
    taxaSemanaDia,
    taxaSemanaNoite,
    taxaFdsDia,
    taxaFdsNoite,
    totalSemanaDia,
    totalSemanaNoite,
    totalFdsDia,
    totalFdsNoite,
    totalHorasExtra,
    piqueteSemana,
    piqueteFds,
    taxaPiqueteSemana,
    taxaPiqueteFds,
    totalPiqueteSemana,
    totalPiqueteFds,
    totalPiquete,
    prevencaoSemana,
    prevencaoFds,
    taxaPrevencaoSemana,
    taxaPrevencaoFds,
    totalPrevencaoSemana,
    totalPrevencaoFds,
    totalPrevencao,
    ajudaCustoAlmoco,
    ajudaCustoJantar,
    ajudaCustoAlojamento,
    taxaAjudaAlmoco,
    taxaAjudaJantar,
    taxaAjudaAlojamento,
    totalAjudasCusto,
    senhaAlmoco,
    senhaJantar,
    senhaCeia,
    taxaSenhaAlmoco: config.senhaAlmoco,
    taxaSenhaJantar: config.senhaJantar,
    taxaSenhaCeia: config.senhaCeia,
    totalSenhas,
    baseImponivel,
    irs,
    ss,
    totalBruto,
    liquido,
    limiteBase,
    limiteMensal,
    totalContaLimite,
    emFalta,
    percentCompleto,
  }
}
