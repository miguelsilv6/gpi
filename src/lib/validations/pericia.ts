import { z } from 'zod'

export const TIPO_PERICIA = [
  'BALISTICA',
  'ADN',
  'INFORMATICA_FORENSE',
  'DOCUMENTAL',
  'TOXICOLOGICA',
  'DACTILOSCOPICA',
  'MEDICO_LEGAL',
  'FINANCEIRA',
  'AVALIACAO',
  'OUTRO',
] as const

export const ESTADO_PERICIA = ['SOLICITADA', 'EM_CURSO', 'CONCLUIDA', 'CANCELADA'] as const

export const TIPO_PERICIA_LABEL: Record<(typeof TIPO_PERICIA)[number], string> = {
  BALISTICA: 'Balística',
  ADN: 'ADN / genética',
  INFORMATICA_FORENSE: 'Informática forense',
  DOCUMENTAL: 'Documental',
  TOXICOLOGICA: 'Toxicológica',
  DACTILOSCOPICA: 'Dactiloscópica (impressões digitais)',
  MEDICO_LEGAL: 'Médico-legal',
  FINANCEIRA: 'Financeira / contabilística',
  AVALIACAO: 'Avaliação',
  OUTRO: 'Outra',
}

export const ESTADO_PERICIA_LABEL: Record<(typeof ESTADO_PERICIA)[number], string> = {
  SOLICITADA: 'Solicitada',
  EM_CURSO: 'Em curso',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
}

/** Estados terminais (a perícia já não está pendente de resultado). */
export const ESTADO_PERICIA_TERMINAL: ReadonlySet<string> = new Set(['CONCLUIDA', 'CANCELADA'])

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

const optDate = dateStr.optional().or(z.literal('')).transform((v) => (v ? v : undefined))

/**
 * Pedido de perícia. `descricao`, `tipo` e `dataPedido` obrigatórios; quando
 * `tipo` = OUTRO, `tipoOutro` passa a obrigatório. `dataConclusao` só se aplica
 * a estados terminais e nunca antes do pedido; `dataPrevista` também não pode
 * anteceder o pedido.
 */
export const periciaCreateSchema = z
  .object({
    tipo: z.enum(TIPO_PERICIA, { message: 'Selecione o tipo' }),
    tipoOutro: opt(80),
    descricao: z.string().trim().min(1, 'Descreva a perícia').max(500),
    entidade: opt(200),
    numeroReferencia: opt(80),
    dataPedido: dateStr,
    dataPrevista: optDate,
    estado: z.enum(ESTADO_PERICIA).optional(),
    dataConclusao: optDate,
    resultado: opt(2000),
    observacoes: opt(2000),
    apreensaoId: opt(40),
  })
  .refine((d) => d.tipo !== 'OUTRO' || !!d.tipoOutro, {
    message: 'Descreva o tipo de perícia',
    path: ['tipoOutro'],
  })
  .refine((d) => !d.dataConclusao || (!!d.estado && ESTADO_PERICIA_TERMINAL.has(d.estado)), {
    message: 'A data de conclusão só se aplica a perícias concluídas ou canceladas',
    path: ['dataConclusao'],
  })
  .refine((d) => !d.dataConclusao || Date.parse(d.dataConclusao) >= Date.parse(d.dataPedido), {
    message: 'A data de conclusão não pode ser anterior à data do pedido',
    path: ['dataConclusao'],
  })
  .refine((d) => !d.dataPrevista || Date.parse(d.dataPrevista) >= Date.parse(d.dataPedido), {
    message: 'A data prevista não pode ser anterior à data do pedido',
    path: ['dataPrevista'],
  })

export const periciaUpdateSchema = periciaCreateSchema

export type PericiaInput = z.infer<typeof periciaCreateSchema>
