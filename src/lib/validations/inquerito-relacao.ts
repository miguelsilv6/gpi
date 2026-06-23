import { z } from 'zod'
import type { TipoRelacaoInquerito } from '@/generated/prisma/enums'

export const RELACAO_NOTA_MAX = 500

export const TIPO_RELACAO_VALUES = ['RELACIONADO', 'APENSO', 'CONEXO'] as const

export const TIPO_RELACAO_LABEL: Record<TipoRelacaoInquerito, string> = {
  RELACIONADO: 'Relacionado',
  APENSO: 'Apenso',
  CONEXO: 'Conexo',
}

export const TIPO_RELACAO_DESC: Record<TipoRelacaoInquerito, string> = {
  RELACIONADO: 'Relação genérica de investigação',
  APENSO: 'Processos fisicamente apensados',
  CONEXO: 'Conexão de processos (art. 24.º CPP)',
}

export const inqueritoRelacaoCreateSchema = z.object({
  destinoId: z.string().min(1, 'Inquérito de destino em falta'),
  tipo: z.enum(TIPO_RELACAO_VALUES).default('RELACIONADO'),
  nota: z
    .string()
    .trim()
    .max(RELACAO_NOTA_MAX, `A nota não pode exceder ${RELACAO_NOTA_MAX} caracteres`)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
})

export type InqueritoRelacaoCreateData = z.infer<typeof inqueritoRelacaoCreateSchema>
