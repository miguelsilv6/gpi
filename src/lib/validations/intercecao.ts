import { z } from 'zod'
import type {
  TipoLinhaIntercecao,
  TipoProdutoIntercecao,
  DirecaoProdutoIntercecao,
} from '@/generated/prisma/enums'
import { diasRestantes } from '@/lib/prazos'

export const INTERCECAO_NOME_MAX = 200
export const INTERCECAO_CODIGO_MAX = 30
export const INTERCECAO_IDENTIFICADOR_MAX = 50
export const INTERCECAO_REDE_MAX = 40
export const INTERCECAO_OBS_MAX = 2000
export const INTERCECAO_RESUMO_MAX = 4000
export const INTERCECAO_COMENTARIOS_MAX = 2000
export const INTERCECAO_NUMERO_PRODUTO_MAX = 40

// Defaults dos alertas de fim (dias antes), editáveis por linha.
export const INTERCECAO_ALERTA1_DEFAULT = 10
export const INTERCECAO_ALERTA2_DEFAULT = 3

export const TIPO_LINHA_VALUES = ['SIM', 'IMEI', 'OUTRO'] as const

export const TIPO_LINHA_LABEL: Record<TipoLinhaIntercecao, string> = {
  SIM: 'Cartão SIM',
  IMEI: 'IMEI',
  OUTRO: 'Outro',
}

export const TIPO_PRODUTO_VALUES = ['CHAMADA', 'SMS', 'MMS', 'DADOS', 'LOCALIZACAO', 'OUTRO'] as const

export const TIPO_PRODUTO_LABEL: Record<TipoProdutoIntercecao, string> = {
  CHAMADA: 'Chamada',
  SMS: 'SMS',
  MMS: 'MMS',
  DADOS: 'Dados',
  LOCALIZACAO: 'Localização',
  OUTRO: 'Outro',
}

// Classes de cor (badge) por tipo de produto — usadas nas tabelas.
export const TIPO_PRODUTO_BADGE: Record<TipoProdutoIntercecao, string> = {
  CHAMADA: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  SMS: 'bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300',
  MMS: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300',
  DADOS: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  LOCALIZACAO: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
  OUTRO: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

export const DIRECAO_VALUES = ['EFETUADA', 'RECEBIDA'] as const

export const DIRECAO_LABEL: Record<DirecaoProdutoIntercecao, string> = {
  EFETUADA: 'Efetuada',
  RECEBIDA: 'Recebida',
}

// "HH:mm" ou "HH:mm:ss" com horas 00-23, minutos e segundos 00-59.
export const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/
const horaSchema = z
  .string()
  .regex(HORA_REGEX, 'Hora inválida (formato HH:mm ou HH:mm:ss)')

// Duração "mm:ss" ou "hh:mm:ss" (sobretudo para chamadas).
export const DURACAO_REGEX = /^\d{1,3}:[0-5]\d(:[0-5]\d)?$/
const duracaoSchema = z.string().regex(DURACAO_REGEX, 'Duração inválida (mm:ss ou hh:mm:ss)')

export const INTERCECAO_NOTAS_MAX = 4000

const alertaDiasSchema = z
  .number()
  .int('Os dias de alerta têm de ser um número inteiro')
  .min(0, 'Os dias de alerta não podem ser negativos')
  .max(365, 'Os dias de alerta não podem exceder 365')

// ── Alvo ─────────────────────────────────────────────────────────────────────

export const intercecaoAlvoCreateSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'O nome do suspeito é obrigatório')
    .max(INTERCECAO_NOME_MAX, `O nome não pode exceder ${INTERCECAO_NOME_MAX} caracteres`),
  codigo: z
    .string()
    .trim()
    .min(1, 'O código do alvo é obrigatório')
    .max(INTERCECAO_CODIGO_MAX, `O código não pode exceder ${INTERCECAO_CODIGO_MAX} caracteres`),
  observacoes: z
    .string()
    .trim()
    .max(INTERCECAO_OBS_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  notas: z
    .string()
    .trim()
    .max(INTERCECAO_NOTAS_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
})

// No update, os campos opcionais são mantidos "crus" (sem transformar '' em
// undefined): a rota distingue "omitido" (saltar) de "string vazia" (limpar).
export const intercecaoAlvoUpdateSchema = z.object({
  nome: z.string().trim().min(1, 'O nome do suspeito é obrigatório').max(INTERCECAO_NOME_MAX).optional(),
  codigo: z.string().trim().min(1, 'O código do alvo é obrigatório').max(INTERCECAO_CODIGO_MAX).optional(),
  observacoes: z.string().max(INTERCECAO_OBS_MAX).optional(),
  notas: z.string().max(INTERCECAO_NOTAS_MAX).optional(),
})

// ── Linha ────────────────────────────────────────────────────────────────────

export const intercecaoLinhaCreateSchema = z
  .object({
    tipo: z.enum(TIPO_LINHA_VALUES),
    identificador: z
      .string()
      .trim()
      .min(1, 'O n.º de telefone / IMEI é obrigatório')
      .max(INTERCECAO_IDENTIFICADOR_MAX),
    rede: z
      .string()
      .trim()
      .max(INTERCECAO_REDE_MAX)
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
    // Strings "YYYY-MM-DD"; parseadas/validadas na rota.
    dataInicio: z.string().min(1, 'A data de início é obrigatória'),
    dataFim: z.string().min(1, 'A data de fim é obrigatória'),
    alertaDias1: alertaDiasSchema.nullable().optional(),
    alertaDias2: alertaDiasSchema.nullable().optional(),
    observacoes: z
      .string()
      .trim()
      .max(INTERCECAO_OBS_MAX)
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
  })
  .refine(
    (d) => {
      const inicio = new Date(d.dataInicio)
      const fim = new Date(d.dataFim)
      if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return true // NaN tratado na rota
      return fim.getTime() >= inicio.getTime()
    },
    { message: 'A data de fim não pode ser anterior à de início', path: ['dataFim'] },
  )

export const intercecaoLinhaUpdateSchema = z.object({
  tipo: z.enum(TIPO_LINHA_VALUES).optional(),
  identificador: z
    .string()
    .trim()
    .min(1, 'O n.º de telefone / IMEI é obrigatório')
    .max(INTERCECAO_IDENTIFICADOR_MAX)
    .optional(),
  rede: z.string().max(INTERCECAO_REDE_MAX).optional(),
  dataInicio: z.string().min(1).optional(),
  dataFim: z.string().min(1).optional(),
  alertaDias1: alertaDiasSchema.nullable().optional(),
  alertaDias2: alertaDiasSchema.nullable().optional(),
  observacoes: z.string().max(INTERCECAO_OBS_MAX).optional(),
})

// Renovação (prorrogação): a nova data de fim é validada na rota (posterior
// à atual). Reutiliza o mesmo reset de flags de alerta que a edição.
export const intercecaoRenovarSchema = z.object({
  novaDataFim: z.string().min(1, 'A nova data de fim é obrigatória'),
})

// ── Produto ──────────────────────────────────────────────────────────────────

export const intercecaoProdutoCreateSchema = z.object({
  tipo: z.enum(TIPO_PRODUTO_VALUES),
  linhaId: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  numeroProduto: z
    .string()
    .trim()
    .max(INTERCECAO_NUMERO_PRODUTO_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  direcao: z
    .union([z.enum(DIRECAO_VALUES), z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  data: z.string().min(1, 'A data é obrigatória'),
  horaInicio: z
    .union([horaSchema, z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  horaFim: z
    .union([horaSchema, z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  duracao: z
    .union([duracaoSchema, z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  paraTranscricao: z.boolean().optional(),
  de: z
    .string()
    .trim()
    .max(INTERCECAO_IDENTIFICADOR_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  para: z
    .string()
    .trim()
    .max(INTERCECAO_IDENTIFICADOR_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  resumo: z
    .string()
    .trim()
    .min(1, 'O resumo é obrigatório')
    .max(INTERCECAO_RESUMO_MAX, `O resumo não pode exceder ${INTERCECAO_RESUMO_MAX} caracteres`),
  comentarios: z
    .string()
    .trim()
    .max(INTERCECAO_COMENTARIOS_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
})

export const intercecaoProdutoUpdateSchema = z.object({
  tipo: z.enum(TIPO_PRODUTO_VALUES).optional(),
  linhaId: z.string().optional(),
  numeroProduto: z.string().max(INTERCECAO_NUMERO_PRODUTO_MAX).optional(),
  direcao: z.union([z.enum(DIRECAO_VALUES), z.literal('')]).optional(),
  data: z.string().min(1).optional(),
  horaInicio: z.union([horaSchema, z.literal('')]).optional(),
  horaFim: z.union([horaSchema, z.literal('')]).optional(),
  duracao: z.union([duracaoSchema, z.literal('')]).optional(),
  paraTranscricao: z.boolean().optional(),
  de: z.string().max(INTERCECAO_IDENTIFICADOR_MAX).optional(),
  para: z.string().max(INTERCECAO_IDENTIFICADOR_MAX).optional(),
  resumo: z.string().trim().min(1, 'O resumo é obrigatório').max(INTERCECAO_RESUMO_MAX).optional(),
  comentarios: z.string().max(INTERCECAO_COMENTARIOS_MAX).optional(),
})

// ── Helpers puros (testáveis sem BD) ─────────────────────────────────────────

/** Estado de uma linha em função da data de fim: ativa até ao fim do dia. */
export function estadoLinha(dataFim: Date, now: Date = new Date()): 'ativa' | 'terminada' {
  return diasRestantes(dataFim, now) >= 0 ? 'ativa' : 'terminada'
}

export interface LinhaAlertavel {
  dataFim: Date
  alertaDias1: number | null
  alertaDias2: number | null
  alerta1Enviado: boolean
  alerta2Enviado: boolean
}

/**
 * Que avisos (1.º/2.º) estão devidos para uma linha: dispara quando faltam
 * `alertaDiasN` dias ou menos e o flag ainda não foi enviado. Sem limite
 * inferior: uma linha já vencida sem aviso dispara uma vez (o flag trava as
 * repetições). Os dois avisos podem ser devidos na mesma corrida (precedente
 * do padrão Atividade — cada um dispara e marca o seu flag).
 */
export function alertasDevidos(linha: LinhaAlertavel, now: Date = new Date()): Array<1 | 2> {
  const dias = diasRestantes(linha.dataFim, now)
  const devidos: Array<1 | 2> = []
  if (linha.alertaDias1 != null && !linha.alerta1Enviado && dias <= linha.alertaDias1) devidos.push(1)
  if (linha.alertaDias2 != null && !linha.alerta2Enviado && dias <= linha.alertaDias2) devidos.push(2)
  return devidos
}

/**
 * Flags a repor quando a linha é editada: mudar a data de fim reabre os dois
 * avisos; mudar os dias de um aviso reabre esse aviso. (Corrige o gotcha do
 * padrão antigo, em que adiar um prazo depois do aviso nunca voltava a alertar.)
 */
export function resetAlertFlagsOnUpdate(
  before: { dataFim: Date; alertaDias1: number | null; alertaDias2: number | null },
  changes: { dataFim?: Date; alertaDias1?: number | null; alertaDias2?: number | null },
): { alerta1Enviado?: false; alerta2Enviado?: false } {
  const reset: { alerta1Enviado?: false; alerta2Enviado?: false } = {}
  const dataFimChanged =
    changes.dataFim !== undefined && changes.dataFim.getTime() !== before.dataFim.getTime()
  if (dataFimChanged) {
    reset.alerta1Enviado = false
    reset.alerta2Enviado = false
    return reset
  }
  if (changes.alertaDias1 !== undefined && changes.alertaDias1 !== before.alertaDias1) {
    reset.alerta1Enviado = false
  }
  if (changes.alertaDias2 !== undefined && changes.alertaDias2 !== before.alertaDias2) {
    reset.alerta2Enviado = false
  }
  return reset
}
