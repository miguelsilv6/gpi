import { describe, test, expect } from 'vitest'
import { inqueritoSchema } from '@/lib/validations/inquerito'

/**
 * Regressão: um NUIPC guardado com espaço em branco (inicial/final) passa na
 * pesquisa por substring (`contains`) mas falha na comparação exata usada
 * pela página de detalhe (`findFirst({ where: { nuipc } })`) — resultado:
 * "Página não encontrada" para um inquérito que existe. O `.trim()` no
 * schema evita que esse espaço chegue à base de dados.
 */

const base = {
  crimeId: 'crime-1',
  estadoId: 'estado-1',
  dataAbertura: '2026-01-01',
  brigadaId: 'brigada-1',
}

describe('inqueritoSchema — nuipc', () => {
  test('espaços iniciais/finais são removidos', () => {
    const parsed = inqueritoSchema.safeParse({ ...base, nuipc: '  742/24.5JGLSB  ' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.nuipc).toBe('742/24.5JGLSB')
  })

  test('só espaços é rejeitado (obrigatório)', () => {
    expect(inqueritoSchema.safeParse({ ...base, nuipc: '   ' }).success).toBe(false)
  })
})
