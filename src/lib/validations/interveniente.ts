import { z } from 'zod'

/** Papéis possíveis (lista fixa + OUTRO com texto livre em `tipoOutro`). */
export const TIPO_INTERVENIENTE = [
  'LESADO',
  'VITIMA',
  'TESTEMUNHA',
  'ADVOGADO',
  'ARGUIDO',
  'PERITO',
  'OUTRO',
] as const

/** Igual ao denunciante: natureza da pessoa. */
export const TIPO_PESSOA = ['SINGULAR', 'COLETIVA', 'ENTIDADE_PUBLICA', 'OUTROS'] as const

export const TIPO_INTERVENIENTE_LABEL: Record<(typeof TIPO_INTERVENIENTE)[number], string> = {
  LESADO: 'Lesado',
  VITIMA: 'Vítima',
  TESTEMUNHA: 'Testemunha',
  ADVOGADO: 'Advogado / Mandatário',
  ARGUIDO: 'Arguido / Suspeito',
  PERITO: 'Perito',
  OUTRO: 'Outro',
}

export const TIPO_PESSOA_LABEL: Record<(typeof TIPO_PESSOA)[number], string> = {
  SINGULAR: 'Pessoa singular',
  COLETIVA: 'Pessoa coletiva',
  ENTIDADE_PUBLICA: 'Entidade pública',
  OUTROS: 'Outros',
}

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v))

/**
 * Interveniente adicional do inquérito (para além do denunciante). Só `tipo` e
 * `nome` são obrigatórios; o resto espelha o denunciante e é opcional. Quando
 * `tipo` = OUTRO, `tipoOutro` passa a ser obrigatório (descrição do papel).
 */
export const intervenienteCreateSchema = z
  .object({
    tipo: z.enum(TIPO_INTERVENIENTE, { message: 'Selecione o tipo de interveniente' }),
    tipoOutro: opt(80),
    nome: z.string().trim().min(1, 'Indique o nome').max(200, 'Máximo 200 caracteres'),
    tipoPessoa: z.enum(TIPO_PESSOA).optional(),
    nif: opt(20),
    morada: opt(300),
    codPostal: opt(20),
    localidade: opt(120),
    contacto: opt(60),
    email: opt(200),
    responsavel: opt(200),
    notas: opt(2000),
  })
  .refine((d) => d.tipo !== 'OUTRO' || !!d.tipoOutro, {
    message: 'Descreva o tipo de interveniente',
    path: ['tipoOutro'],
  })

// O PUT reenvia o objeto completo (o formulário tem todos os campos), pelo que
// a validação de atualização é a mesma da criação.
export const intervenienteUpdateSchema = intervenienteCreateSchema

export type IntervenienteInput = z.infer<typeof intervenienteCreateSchema>
