import { addMonths, differenceInCalendarDays } from 'date-fns'

/**
 * Prazo legal de um inquérito.
 *
 * Limite legal = data de abertura + (duração-base configurada + soma das
 * prorrogações), em meses. A duração-base e o limiar de aviso são
 * parametrizáveis pelo administrador (ConfiguracaoSistema), para se ajustarem
 * aos prazos aplicáveis sem hardcode de regras processuais.
 */

export type PrazoLegalEstado = 'ok' | 'a_vencer' | 'vencido'

export interface PrazoLegalResult {
  data: Date
  /** Dias de calendário até ao limite (negativo = ultrapassado). */
  diasRestantes: number
  estado: PrazoLegalEstado
  baseMeses: number
  prorrogacaoMeses: number
  totalMeses: number
}

export function computePrazoLegal(args: {
  dataAbertura: Date
  baseMeses: number
  prorrogacaoMeses: number
  alertaDias: number
  now?: Date
}): PrazoLegalResult {
  const now = args.now ?? new Date()
  const prorrogacaoMeses = Math.max(0, args.prorrogacaoMeses)
  const totalMeses = Math.max(0, args.baseMeses) + prorrogacaoMeses
  const data = addMonths(args.dataAbertura, totalMeses)
  const diasRestantes = differenceInCalendarDays(data, now)
  const estado: PrazoLegalEstado =
    diasRestantes < 0 ? 'vencido' : diasRestantes <= args.alertaDias ? 'a_vencer' : 'ok'

  return {
    data,
    diasRestantes,
    estado,
    baseMeses: Math.max(0, args.baseMeses),
    prorrogacaoMeses,
    totalMeses,
  }
}
