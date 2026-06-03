import { z } from 'zod'

// Dates are sent as 'YYYY-MM-DD' (date-only). They are normalised to local
// midnight on the server. Range is inclusive — a single day (inicio === fim)
// is allowed.
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (esperado YYYY-MM-DD)')

export const ausenciaCreateSchema = z
  .object({
    tipo: z.enum(['FERIAS', 'FOLGA']),
    dataInicio: dateOnly,
    dataFim: dateOnly,
    nota: z.string().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.dataFim < data.dataInicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataFim'],
        message: 'A data de fim não pode ser anterior à data de início',
      })
    }
  })

export const ausenciaUpdateSchema = z
  .object({
    tipo: z.enum(['FERIAS', 'FOLGA']).optional(),
    dataInicio: dateOnly.optional(),
    dataFim: dateOnly.optional(),
    nota: z.string().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.dataInicio && data.dataFim && data.dataFim < data.dataInicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataFim'],
        message: 'A data de fim não pode ser anterior à data de início',
      })
    }
  })

export type AusenciaCreateData = z.infer<typeof ausenciaCreateSchema>
export type AusenciaUpdateData = z.infer<typeof ausenciaUpdateSchema>
