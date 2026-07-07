import { z } from 'zod'

export const COLABORADOR_MOTIVO_MAX = 500

/**
 * Concessão de colaboração. `expiraEm` é uma data "YYYY-MM-DD" (opcional) —
 * interpretada como fim desse dia na rota; vazio/ausente = sem prazo.
 */
export const colaboradorCreateSchema = z.object({
  colaboradorId: z.string().trim().min(1, 'Selecione o inspetor a autorizar'),
  motivo: z
    .string()
    .trim()
    .max(COLABORADOR_MOTIVO_MAX, `O motivo não pode exceder ${COLABORADOR_MOTIVO_MAX} caracteres`)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  expiraEm: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
})

export type ColaboradorCreateInput = z.infer<typeof colaboradorCreateSchema>
