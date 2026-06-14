import { z } from 'zod'

export const PRIORIDADES = ['BAIXA', 'NORMAL', 'ALTA'] as const
export type Prioridade = (typeof PRIORIDADES)[number]

export const tarefaCreateSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, 'O título não pode estar vazio')
    .max(200, 'O título não pode exceder 200 caracteres'),
  descricao: z.string().trim().max(10000).optional(),
  prioridade: z.enum(PRIORIDADES).default('NORMAL'),
})

export const tarefaUpdateSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, 'O título não pode estar vazio')
    .max(200, 'O título não pode exceder 200 caracteres')
    .optional(),
  descricao: z.string().trim().max(10000).optional().nullable(),
  prioridade: z.enum(PRIORIDADES).optional(),
  concluida: z.boolean().optional(),
})

export type TarefaCreateData = z.infer<typeof tarefaCreateSchema>
export type TarefaUpdateData = z.infer<typeof tarefaUpdateSchema>
