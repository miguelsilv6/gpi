import { z } from 'zod'

export const notaInqueritoCreateSchema = z.object({
  conteudo: z
    .string()
    .trim()
    .min(1, 'A nota não pode estar vazia')
    .max(5000, 'A nota não pode exceder 5000 caracteres'),
})

export type NotaInqueritoCreateData = z.infer<typeof notaInqueritoCreateSchema>
