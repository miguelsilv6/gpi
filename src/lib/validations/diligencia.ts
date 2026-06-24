import { z } from 'zod'
import type { TipoDiligencia } from '@/generated/prisma/enums'

export const DILIGENCIA_TITULO_MAX = 200
export const DILIGENCIA_LOCAL_MAX = 200
export const DILIGENCIA_OBS_MAX = 2000

export const TIPO_DILIGENCIA_VALUES = [
  'JULGAMENTO',
  'INQUIRICAO',
  'BUSCA',
  'INTERROGATORIO',
  'RECONSTITUICAO',
  'REUNIAO',
  'OUTRA',
] as const

export const TIPO_DILIGENCIA_LABEL: Record<TipoDiligencia, string> = {
  JULGAMENTO: 'Julgamento',
  INQUIRICAO: 'Inquirição',
  BUSCA: 'Busca',
  INTERROGATORIO: 'Interrogatório',
  RECONSTITUICAO: 'Reconstituição',
  REUNIAO: 'Reunião',
  OUTRA: 'Outra',
}

// Classes de cor (badge) por tipo — usadas na lista da agenda.
export const TIPO_DILIGENCIA_BADGE: Record<TipoDiligencia, string> = {
  JULGAMENTO: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
  INQUIRICAO: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  BUSCA: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  INTERROGATORIO: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300',
  RECONSTITUICAO: 'bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300',
  REUNIAO: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  OUTRA: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

export const diligenciaCreateSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, 'O título é obrigatório')
    .max(DILIGENCIA_TITULO_MAX, `O título não pode exceder ${DILIGENCIA_TITULO_MAX} caracteres`),
  tipo: z.enum(TIPO_DILIGENCIA_VALUES).default('OUTRA'),
  // datetime-local string ("YYYY-MM-DDTHH:mm"); validada/parseada na rota.
  dataInicio: z.string().min(1, 'A data é obrigatória'),
  dataFim: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  local: z
    .string()
    .trim()
    .max(DILIGENCIA_LOCAL_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  observacoes: z
    .string()
    .trim()
    .max(DILIGENCIA_OBS_MAX)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  inqueritoId: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  concluida: z.boolean().optional(),
})

export const diligenciaUpdateSchema = diligenciaCreateSchema.partial()

export type DiligenciaCreateData = z.infer<typeof diligenciaCreateSchema>
