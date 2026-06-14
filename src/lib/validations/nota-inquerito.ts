import { z } from 'zod'

export const NOTA_TITULO_MAX = 200
export const NOTA_CONTEUDO_MAX = 20000

export const notaInqueritoCreateSchema = z.object({
  titulo: z
    .string()
    .trim()
    .max(NOTA_TITULO_MAX, `O título não pode exceder ${NOTA_TITULO_MAX} caracteres`)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  conteudo: z
    .string()
    .trim()
    .min(1, 'A nota não pode estar vazia')
    .max(NOTA_CONTEUDO_MAX, `A nota não pode exceder ${NOTA_CONTEUDO_MAX} caracteres`),
})

export const notaInqueritoUpdateSchema = z.object({
  titulo: z
    .string()
    .trim()
    .max(NOTA_TITULO_MAX, `O título não pode exceder ${NOTA_TITULO_MAX} caracteres`)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  conteudo: z
    .string()
    .trim()
    .min(1, 'A nota não pode estar vazia')
    .max(NOTA_CONTEUDO_MAX, `A nota não pode exceder ${NOTA_CONTEUDO_MAX} caracteres`),
})

export type NotaInqueritoCreateData = z.infer<typeof notaInqueritoCreateSchema>
export type NotaInqueritoUpdateData = z.infer<typeof notaInqueritoUpdateSchema>
