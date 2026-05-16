import { z } from 'zod'

const ESTADOS = ['ABERTO', 'EM_INVESTIGACAO', 'SUSPENSO', 'CONCLUIDO', 'ARQUIVADO'] as const
const FASES = ['INQUERITO', 'INSTRUCAO', 'JULGAMENTO', 'RECURSO', 'TRANSITO_EM_JULGADO'] as const

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isFinite(d.getTime()) ? d : null
}

export const inqueritoSchema = z
  .object({
    nuipc: z.string().min(1, 'NUIPC obrigatório'),
    nai: z.string().max(100).optional().nullable(),
    natureza: z.string().min(1, 'Natureza obrigatória').max(200),
    estado: z.enum(ESTADOS),
    faseProcessual: z.enum(FASES),
    dataAbertura: z.string().min(1, 'Data de abertura obrigatória'),
    dataPrazo: z.string().optional().nullable(),
    dataConclusao: z.string().optional().nullable(),
    notas: z.string().optional().nullable(),
    brigadaId: z.string().min(1, 'Brigada obrigatória'),
    inspetorId: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const abertura = parseDate(data.dataAbertura)
    if (!abertura) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataAbertura'],
        message: 'Data de abertura inválida',
      })
      return
    }

    const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000)
    if (abertura > TOMORROW) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataAbertura'],
        message: 'Data de abertura não pode ser futura',
      })
    }

    const prazo = parseDate(data.dataPrazo)
    if (data.dataPrazo && !prazo) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataPrazo'],
        message: 'Data de prazo inválida',
      })
    }
    if (prazo && prazo < abertura) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataPrazo'],
        message: 'Prazo não pode ser anterior à data de abertura',
      })
    }

    const conclusao = parseDate(data.dataConclusao)
    if (data.dataConclusao && !conclusao) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataConclusao'],
        message: 'Data de conclusão inválida',
      })
    }
    if (conclusao && conclusao < abertura) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataConclusao'],
        message: 'Data de conclusão não pode ser anterior à abertura',
      })
    }
    if (conclusao && conclusao > TOMORROW) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataConclusao'],
        message: 'Data de conclusão não pode ser futura',
      })
    }

    // dataConclusao required iff estado is terminal
    const isTerminal = data.estado === 'CONCLUIDO' || data.estado === 'ARQUIVADO'
    if (isTerminal && !conclusao) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataConclusao'],
        message: 'Estado terminal exige data de conclusão',
      })
    }
    if (!isTerminal && conclusao) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataConclusao'],
        message: 'Data de conclusão só se aplica a estados terminais',
      })
    }
  })

export type InqueritoFormData = z.infer<typeof inqueritoSchema>

export const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(['assign', 'changeState', 'changeFase', 'transfer']),
  inspetorId: z.string().nullable().optional(),
  estado: z.enum(ESTADOS).optional(),
  faseProcessual: z.enum(FASES).optional(),
  brigadaId: z.string().optional(),
})
