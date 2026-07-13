import { z } from 'zod'

export const TIPO_APREENSAO = [
  'ARMA',
  'VEICULO',
  'DINHEIRO',
  'DROGA',
  'EQUIPAMENTO_INFORMATICO',
  'DOCUMENTO',
  'OUTRO',
] as const

export const ESTADO_APREENSAO = [
  'EM_CUSTODIA',
  'A_AGUARDAR_EXAME',
  'DEVOLVIDO',
  'PERDIDO_A_FAVOR_ESTADO',
  'DESTRUIDO',
] as const

export const TIPO_APREENSAO_LABEL: Record<(typeof TIPO_APREENSAO)[number], string> = {
  ARMA: 'Arma',
  VEICULO: 'Veículo',
  DINHEIRO: 'Dinheiro / valores',
  DROGA: 'Estupefaciente',
  EQUIPAMENTO_INFORMATICO: 'Equipamento informático',
  DOCUMENTO: 'Documento',
  OUTRO: 'Outro',
}

export const ESTADO_APREENSAO_LABEL: Record<(typeof ESTADO_APREENSAO)[number], string> = {
  EM_CUSTODIA: 'Em custódia',
  A_AGUARDAR_EXAME: 'A aguardar exame',
  DEVOLVIDO: 'Devolvido',
  PERDIDO_A_FAVOR_ESTADO: 'Perdido a favor do Estado',
  DESTRUIDO: 'Destruído',
}

/** Estados terminais da custódia (o objeto já tem destino dado). */
export const ESTADO_APREENSAO_TERMINAL: ReadonlySet<string> = new Set([
  'DEVOLVIDO',
  'PERDIDO_A_FAVOR_ESTADO',
  'DESTRUIDO',
])

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v))

const dateStr = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida')

/**
 * Apreensão de um objeto. `descricao`, `tipo` e `dataApreensao` obrigatórios;
 * quando `tipo` = OUTRO, `tipoOutro` passa a obrigatório.
 */
export const apreensaoCreateSchema = z
  .object({
    descricao: z.string().trim().min(1, 'Descreva o objeto apreendido').max(500),
    tipo: z.enum(TIPO_APREENSAO, { message: 'Selecione o tipo' }),
    tipoOutro: opt(80),
    quantidade: opt(60),
    numeroAuto: opt(60),
    dataApreensao: dateStr,
    local: opt(200),
    apreendidoA: opt(200),
    localCustodia: opt(200),
    estado: z.enum(ESTADO_APREENSAO).optional(),
    dataDestino: dateStr.optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
    observacoes: opt(2000),
  })
  .refine((d) => d.tipo !== 'OUTRO' || !!d.tipoOutro, {
    message: 'Descreva o tipo de apreensão',
    path: ['tipoOutro'],
  })
  // A data do destino só faz sentido quando o objeto já teve destino (estado
  // terminal). O estado omitido assume EM_CUSTODIA (não terminal).
  .refine((d) => !d.dataDestino || (!!d.estado && ESTADO_APREENSAO_TERMINAL.has(d.estado)), {
    message: 'A data do destino só se aplica a apreensões concluídas',
    path: ['dataDestino'],
  })
  .refine((d) => !d.dataDestino || Date.parse(d.dataDestino) >= Date.parse(d.dataApreensao), {
    message: 'A data do destino não pode ser anterior à data da apreensão',
    path: ['dataDestino'],
  })

export const apreensaoUpdateSchema = apreensaoCreateSchema

export type ApreensaoInput = z.infer<typeof apreensaoCreateSchema>
