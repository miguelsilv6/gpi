import { z } from 'zod'

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isFinite(d.getTime()) ? d : null
}

/**
 * Note: the terminal-vs-dataConclusao consistency check used to be expressed
 * here as a Zod refinement against the enum. With dynamic estados, the route
 * handlers now do that check using the EstadoInquerito row (which has the
 * `terminal` flag). This schema stays purely shape-level.
 */
export const inqueritoSchema = z
  .object({
    nuipc: z.string().min(1, 'NUIPC obrigatório'),
    nai: z.string().max(100).optional().nullable(),
    crimeId: z.string().min(1, 'Crime obrigatório'),
    estadoId: z.string().min(1, 'Estado obrigatório'),
    dataAbertura: z.string().min(1, 'Data de abertura obrigatória'),
    dataPrazo: z.string().optional().nullable(),
    dataConclusao: z.string().optional().nullable(),
    notas: z.string().optional().nullable(),
    brigadaId: z.string().min(1, 'Brigada obrigatória'),
    inspetorId: z.string().optional().nullable(),
    // Tribunal / Ministério Público — all optional
    tribunal: z.string().max(200).optional().nullable(),
    procurador: z.string().max(200).optional().nullable(),
    oficialJustica: z.string().max(200).optional().nullable(),
    voip: z.string().max(100).optional().nullable(),
    notasTribunal: z.string().max(2000).optional().nullable(),
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

    // Compare in day-precision: floor both to local midnight to ignore time
    // zone clock drift between client and server.
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const aberturaDay = new Date(abertura)
    aberturaDay.setHours(0, 0, 0, 0)
    if (aberturaDay > startOfToday) {
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
    if (conclusao) {
      const conclusaoDay = new Date(conclusao)
      conclusaoDay.setHours(0, 0, 0, 0)
      if (conclusaoDay > startOfToday) {
        ctx.addIssue({
          code: 'custom',
          path: ['dataConclusao'],
          message: 'Data de conclusão não pode ser futura',
        })
      }
    }
  })

export type InqueritoFormData = z.infer<typeof inqueritoSchema>

export const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(['assign', 'changeState', 'transfer']),
  inspetorId: z.string().nullable().optional(),
  estadoId: z.string().optional(),
  brigadaId: z.string().optional(),
})
