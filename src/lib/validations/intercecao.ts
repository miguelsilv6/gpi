import { z } from 'zod'
import type {
  TipoLinhaIntercecao,
  TipoProdutoIntercecao,
  DirecaoProdutoIntercecao,
  EstadoTranscricao,
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
export const INTERCECAO_ID_PRODUTO_MAX = 60
export const INTERCECAO_IDENTIFICACAO_MAX = 200
export const INTERCECAO_CONTACTO_MAX = 40
export const INTERCECAO_MORADA_MAX = 300
export const INTERCECAO_DOCUMENTO_MAX = 80
export const INTERCECAO_FICHA_SPO_MAX = 80

// Cadência das validações (art. 188.º CPP). 14 dias = quinzenal no mesmo dia
// da semana, que é como o controlo em papel é mantido (mantém-se em dia útil).
export const INTERCECAO_VALIDACAO_INTERVALO_DEFAULT = 14
export const INTERCECAO_VALIDACAO_ALERTA_DEFAULT = 3
export const INTERCECAO_VALIDACAO_OBS_MAX = 1000

// Defaults dos alertas de fim (dias antes), editáveis por linha.
export const INTERCECAO_ALERTA1_DEFAULT = 10
export const INTERCECAO_ALERTA2_DEFAULT = 3

export const TIPO_LINHA_VALUES = ['SIM', 'IMEI', 'OUTRO'] as const

export const TIPO_LINHA_LABEL: Record<TipoLinhaIntercecao, string> = {
  SIM: 'Cartão SIM',
  IMEI: 'IMEI',
  OUTRO: 'Outro',
}

export const TIPO_PRODUTO_VALUES = [
  'VOZ',
  'CHAMADA',
  'SMS',
  'MMS',
  'DADOS',
  'RAW',
  'LOCALIZACAO',
  'OUTRO',
] as const

export const TIPO_PRODUTO_LABEL: Record<TipoProdutoIntercecao, string> = {
  VOZ: 'Voz',
  CHAMADA: 'Chamada',
  SMS: 'SMS',
  MMS: 'MMS',
  DADOS: 'Dados',
  RAW: 'Raw (Em Bruto)',
  LOCALIZACAO: 'Localização',
  OUTRO: 'Outro',
}

// Classes de cor (badge) por tipo de produto — usadas nas tabelas.
export const TIPO_PRODUTO_BADGE: Record<TipoProdutoIntercecao, string> = {
  VOZ: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  RAW: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  CHAMADA: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  SMS: 'bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300',
  MMS: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300',
  DADOS: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  LOCALIZACAO: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
  OUTRO: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

export const DIRECAO_VALUES = ['EFETUADA', 'RECEBIDA'] as const

// Rótulos do controlo em papel: o produto é visto da perspetiva do alvo.
export const DIRECAO_LABEL: Record<DirecaoProdutoIntercecao, string> = {
  EFETUADA: 'De saída',
  RECEBIDA: 'De entrada',
}

// ── Transcrição ──────────────────────────────────────────────────────────────

export const TRANSCRICAO_VALUES = ['NENHUMA', 'PEDIDA', 'AUTORIZADA', 'TRANSCRITA'] as const

export const TRANSCRICAO_LABEL: Record<EstadoTranscricao, string> = {
  NENHUMA: '—',
  PEDIDA: 'Pedida',
  AUTORIZADA: 'Autorizada',
  TRANSCRITA: 'Transcrita',
}

export const TRANSCRICAO_BADGE: Record<EstadoTranscricao, string> = {
  NENHUMA: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  PEDIDA: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  AUTORIZADA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  TRANSCRITA: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300',
}

/** Estados que contam como "há trabalho de transcrição" (worklist e export). */
export function temTranscricao(estado: EstadoTranscricao): boolean {
  return estado !== 'NENHUMA'
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
export const INTERCECAO_ACOMPANHAMENTO_MAX = 4000

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
  acompanhamento: z
    .string()
    .trim()
    .max(INTERCECAO_ACOMPANHAMENTO_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
})

// No update, os campos opcionais são mantidos "crus" (sem transformar '' em
// undefined): a rota distingue "omitido" (saltar) de "string vazia" (limpar).
export const intercecaoAlvoUpdateSchema = z.object({
  nome: z.string().trim().min(1, 'O nome do suspeito é obrigatório').max(INTERCECAO_NOME_MAX).optional(),
  observacoes: z.string().max(INTERCECAO_OBS_MAX).optional(),
  notas: z.string().max(INTERCECAO_NOTAS_MAX).optional(),
  acompanhamento: z.string().max(INTERCECAO_ACOMPANHAMENTO_MAX).optional(),
})

// ── Linha ────────────────────────────────────────────────────────────────────

export const intercecaoLinhaCreateSchema = z
  .object({
    codigo: z
      .string()
      .trim()
      .min(1, 'O código do alvo é obrigatório')
      .max(INTERCECAO_CODIGO_MAX, `O código não pode exceder ${INTERCECAO_CODIGO_MAX} caracteres`),
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
    dataOficio: z
      .string()
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
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
  codigo: z.string().trim().min(1, 'O código do alvo é obrigatório').max(INTERCECAO_CODIGO_MAX).optional(),
  tipo: z.enum(TIPO_LINHA_VALUES).optional(),
  identificador: z
    .string()
    .trim()
    .min(1, 'O n.º de telefone / IMEI é obrigatório')
    .max(INTERCECAO_IDENTIFICADOR_MAX)
    .optional(),
  rede: z.string().max(INTERCECAO_REDE_MAX).optional(),
  // '' limpa a data do ofício (distingue-se de omitida, que a mantém).
  dataOficio: z.string().optional(),
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
  idProduto: z
    .string()
    .trim()
    .max(INTERCECAO_ID_PRODUTO_MAX)
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
  transcricao: z.enum(TRANSCRICAO_VALUES).optional(),
  de: z
    .string()
    .trim()
    .max(INTERCECAO_IDENTIFICADOR_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  identificacaoDe: z
    .string()
    .trim()
    .max(INTERCECAO_IDENTIFICACAO_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  para: z
    .string()
    .trim()
    .max(INTERCECAO_IDENTIFICADOR_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  identificacaoPara: z
    .string()
    .trim()
    .max(INTERCECAO_IDENTIFICACAO_MAX)
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
  idProduto: z.string().max(INTERCECAO_ID_PRODUTO_MAX).optional(),
  direcao: z.union([z.enum(DIRECAO_VALUES), z.literal('')]).optional(),
  data: z.string().min(1).optional(),
  horaInicio: z.union([horaSchema, z.literal('')]).optional(),
  horaFim: z.union([horaSchema, z.literal('')]).optional(),
  duracao: z.union([duracaoSchema, z.literal('')]).optional(),
  transcricao: z.enum(TRANSCRICAO_VALUES).optional(),
  de: z.string().max(INTERCECAO_IDENTIFICADOR_MAX).optional(),
  identificacaoDe: z.string().max(INTERCECAO_IDENTIFICACAO_MAX).optional(),
  para: z.string().max(INTERCECAO_IDENTIFICADOR_MAX).optional(),
  identificacaoPara: z.string().max(INTERCECAO_IDENTIFICACAO_MAX).optional(),
  resumo: z.string().trim().min(1, 'O resumo é obrigatório').max(INTERCECAO_RESUMO_MAX).optional(),
  comentarios: z.string().max(INTERCECAO_COMENTARIOS_MAX).optional(),
})

// ── Plano de validações (art. 188.º CPP) ─────────────────────────────────────

const intervaloSchema = z
  .number()
  .int('O intervalo tem de ser um número inteiro de dias')
  .min(1, 'O intervalo tem de ser de pelo menos 1 dia')
  .max(90, 'O intervalo não pode exceder 90 dias')

export const intercecaoPlanoSchema = z.object({
  // "YYYY-MM-DD" — data da 1.ª validação; parseada na rota.
  dataPrimeira: z.string().min(1, 'A data da 1.ª validação é obrigatória'),
  intervaloDias: intervaloSchema.optional(),
  alertaDias: alertaDiasSchema.optional(),
})

export const intercecaoValidacaoUpdateSchema = z.object({
  // true = marcar como feita (data de hoje no servidor); false = desmarcar.
  feita: z.boolean().optional(),
  observacoes: z.string().max(INTERCECAO_VALIDACAO_OBS_MAX).optional(),
})

// ── Relações (contactos identificados) ───────────────────────────────────────

export const intercecaoRelacaoCreateSchema = z.object({
  contacto: z
    .string()
    .trim()
    .min(1, 'O contacto é obrigatório')
    .max(INTERCECAO_CONTACTO_MAX, `O contacto não pode exceder ${INTERCECAO_CONTACTO_MAX} caracteres`),
  nome: z
    .string()
    .trim()
    .max(INTERCECAO_NOME_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  morada: z
    .string()
    .trim()
    .max(INTERCECAO_MORADA_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  documento: z
    .string()
    .trim()
    .max(INTERCECAO_DOCUMENTO_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  dataNascimento: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  fichaSpo: z
    .string()
    .trim()
    .max(INTERCECAO_FICHA_SPO_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  notas: z
    .string()
    .trim()
    .max(INTERCECAO_OBS_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
})

export const intercecaoRelacaoUpdateSchema = z.object({
  contacto: z.string().trim().min(1, 'O contacto é obrigatório').max(INTERCECAO_CONTACTO_MAX).optional(),
  nome: z.string().max(INTERCECAO_NOME_MAX).optional(),
  morada: z.string().max(INTERCECAO_MORADA_MAX).optional(),
  documento: z.string().max(INTERCECAO_DOCUMENTO_MAX).optional(),
  dataNascimento: z.string().optional(),
  fichaSpo: z.string().max(INTERCECAO_FICHA_SPO_MAX).optional(),
  notas: z.string().max(INTERCECAO_OBS_MAX).optional(),
})

// ── "Ouvido até" ─────────────────────────────────────────────────────────────

export const intercecaoOuvidoAteSchema = z.object({
  numeroProduto: z
    .string()
    .trim()
    .max(INTERCECAO_NUMERO_PRODUTO_MAX)
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
  observacoes: z
    .string()
    .trim()
    .max(INTERCECAO_OBS_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
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

// ── Validações quinzenais / lotes de controlo (puros) ────────────────────────

/** Um dia em milissegundos — as datas vivem à meia-noite UTC, logo é exato. */
const DIA_MS = 24 * 60 * 60 * 1000

/** Meia-noite UTC do dia de `d` (as datas do módulo são guardadas assim). */
export function diaUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * Datas das validações de um plano, da 1.ª até cobrir `ate` (inclusive) mais
 * uma — o controlo em papel tem sempre a validação seguinte já escrita, e é
 * nela que se prepara a renovação da última linha a terminar.
 *
 * O intervalo é somado em milissegundos sobre meia-noite UTC, pelo que 14 dias
 * mantêm sempre o mesmo dia da semana (não há saltos de hora legal).
 */
export function datasValidacoes(dataPrimeira: Date, intervaloDias: number, ate: Date): Date[] {
  const intervalo = Math.max(1, Math.trunc(intervaloDias))
  const inicio = diaUTC(dataPrimeira)
  const limite = diaUTC(ate)
  const datas: Date[] = [new Date(inicio)]
  // Cap defensivo: um inquérito com anos de escutas nunca passa das ~500
  // validações, e evita um ciclo infinito se `ate` vier absurdo.
  for (let i = 1; i < 500; i++) {
    const t = inicio + i * intervalo * DIA_MS
    datas.push(new Date(t))
    if (t > limite) break
  }
  return datas
}

/**
 * Número do controlo (lote) a que um produto pertence: 1 antes da 1.ª
 * validação, e daí em diante 1 + número de validações já decorridas. É assim
 * que os separadores "2.º Controlo", "3.º Controlo" aparecem no ficheiro em
 * papel — um produto registado NO dia da validação já conta para o lote
 * seguinte, porque a apresentação desse dia leva o que veio antes.
 */
export function numeroControlo(dataProduto: Date, datasValidacao: readonly Date[]): number {
  const dia = diaUTC(dataProduto)
  let decorridas = 0
  for (const v of datasValidacao) {
    if (diaUTC(v) <= dia) decorridas++
    else break
  }
  return decorridas + 1
}

/**
 * Número da validação em que se prepara a renovação de uma linha: a última
 * cuja data é ANTERIOR ao fim da interceção (a renovação tem de estar pedida
 * antes de a autorização caducar). `null` quando nenhuma validação a precede.
 *
 * Calculado a partir dos parâmetros do plano, não de uma lista carregada: a
 * n-ésima validação cai em `dataPrimeira + (n-1) × intervalo`, logo a última
 * antes de `dataFim` é `ceil((dataFim − dataPrimeira) / intervalo)`. É o mesmo
 * resultado que o controlo em papel assinala ("6.ª Validação/Renovação do
 * Alvo …"), sem depender de quais validações já foram geradas em BD.
 */
export function numeroValidacaoRenovacao(
  dataPrimeira: Date,
  intervaloDias: number,
  dataFim: Date,
): number | null {
  const intervalo = Math.max(1, Math.trunc(intervaloDias))
  const dias = (diaUTC(dataFim) - diaUTC(dataPrimeira)) / DIA_MS
  if (dias <= 0) return null
  return Math.ceil(dias / intervalo)
}

/**
 * Forma canónica de um contacto para comparar números escritos de maneiras
 * diferentes ("928 022 089", "+351 928022089", "928022089"). Mantém um "+"
 * inicial e descarta tudo o que não seja dígito. O indicativo NÃO é removido:
 * "+351928022089" e "928022089" ficam distintos de propósito — inferir que são
 * o mesmo número seria adivinhar o país.
 */
export function normalizarContacto(contacto: string): string {
  const t = contacto.trim()
  const mais = t.startsWith('+') ? '+' : ''
  return mais + t.replace(/\D/g, '')
}

/** Índice contacto normalizado → relação, para resolver os produtos em O(1). */
export function indexarRelacoes<T extends { contacto: string }>(
  relacoes: readonly T[],
): Map<string, T> {
  return new Map(relacoes.map((r) => [normalizarContacto(r.contacto), r]))
}

/**
 * Identificação a mostrar para um número: o nome da Relação, se existir e
 * tiver nome; senão a identificação escrita à mão no produto; senão nada.
 *
 * Vive aqui (e não em `intercecoes-relacoes.ts`) porque as tabelas de produtos
 * do lado do cliente também a usam, e esse módulo importa o Prisma.
 */
export function identificacaoDe(
  numero: string | null,
  manual: string | null,
  index: ReadonlyMap<string, { nome: string | null }>,
): string | null {
  if (numero) {
    const rel = index.get(normalizarContacto(numero))
    if (rel?.nome) return rel.nome
  }
  return manual ?? null
}
