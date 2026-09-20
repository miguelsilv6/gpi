/**
 * Segmentos de duração por estado — transforma a cronologia de estados
 * (já ordenada do mais antigo para o mais recente, uma entrada por
 * transição) nos intervalos [início, fim) usados pela barra visual
 * "Estado do inquérito" (ver estado-duracao-bar.tsx).
 *
 * Função PURA: recebe `EstadoTimelineEntry[]` já calculado e não importa
 * Prisma — testável em isolamento, no mesmo espírito de inquerito-timeline.ts.
 */
import { differenceInCalendarDays } from 'date-fns'
import type { EstadoTimelineEntry } from './estado-timeline'

export interface EstadoDuracaoSegmento {
  /** Chave estável para render. */
  key: string
  estadoCodigo: string
  estadoNome: string
  cor: string | null
  /** ISO datetime de início do segmento. */
  inicio: string
  /** ISO datetime de fim; null quando é o estado atual (ainda em curso). */
  fim: string | null
  /** Duração em dias de calendário (arredondado; 0 = menos de um dia). */
  dias: number
  /** Duração em milissegundos — usado para dimensionar a barra, não para o texto. */
  duracaoMs: number
  atual: boolean
  porNome: string | null
  motivo?: string
}

/**
 * @param entries Cronologia de estados, ordenada ascendentemente por `at`
 *   (a ordem que `getEstadoTimeline` já devolve).
 * @param now Instante de referência para fechar o último segmento (o estado
 *   atual "dura" até agora). Parametrizável para testes determinísticos.
 */
export function buildEstadoDuracao(
  entries: EstadoTimelineEntry[],
  now: Date = new Date(),
): EstadoDuracaoSegmento[] {
  return entries.map((entry, i) => {
    const next = entries[i + 1]
    const inicioDate = new Date(entry.at)
    const fimDate = next ? new Date(next.at) : now
    const duracaoMs = Math.max(0, fimDate.getTime() - inicioDate.getTime())
    return {
      key: `${entry.estadoCodigo}:${entry.at}`,
      estadoCodigo: entry.estadoCodigo,
      estadoNome: entry.estadoNome,
      cor: entry.cor,
      inicio: entry.at,
      fim: next ? next.at : null,
      dias: Math.max(0, differenceInCalendarDays(fimDate, inicioDate)),
      duracaoMs,
      atual: !next,
      porNome: entry.porNome,
      ...(entry.motivo ? { motivo: entry.motivo } : {}),
    }
  })
}

/** Texto de duração em dias, com o caso "menos de um dia" tratado à parte
 *  para não mostrar "0 dias" em transições no mesmo dia. */
export function formatDuracaoDias(dias: number): string {
  if (dias <= 0) return '< 1 dia'
  return `${dias} dia${dias === 1 ? '' : 's'}`
}
