import { describe, test, expect } from 'vitest'
import {
  periciaCreateSchema,
  TIPO_PERICIA,
  ESTADO_PERICIA,
  TIPO_PERICIA_LABEL,
  ESTADO_PERICIA_LABEL,
  ESTADO_PERICIA_TERMINAL,
} from '@/lib/validations/pericia'

const base = { tipo: 'BALISTICA' as const, descricao: 'Exame à arma', dataPedido: '2026-01-10' }

describe('periciaCreateSchema', () => {
  test('aceita uma perícia mínima (tipo + descrição + data do pedido)', () => {
    expect(periciaCreateSchema.safeParse(base).success).toBe(true)
  })

  test('rejeita sem descrição', () => {
    expect(periciaCreateSchema.safeParse({ ...base, descricao: '  ' }).success).toBe(false)
  })

  test('rejeita tipo inválido', () => {
    expect(
      periciaCreateSchema.safeParse({ ...base, tipo: 'ASTROLOGIA' }).success,
    ).toBe(false)
  })

  test('tipo OUTRO exige tipoOutro', () => {
    expect(periciaCreateSchema.safeParse({ ...base, tipo: 'OUTRO' }).success).toBe(false)
    expect(
      periciaCreateSchema.safeParse({ ...base, tipo: 'OUTRO', tipoOutro: 'Odontológica' }).success,
    ).toBe(true)
  })

  test('normaliza strings vazias para undefined', () => {
    const r = periciaCreateSchema.safeParse({ ...base, entidade: '', numeroReferencia: '  ' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.entidade).toBeUndefined()
      expect(r.data.numeroReferencia).toBeUndefined()
    }
  })

  test('dataConclusao só é aceite em estados terminais', () => {
    // Em curso (não terminal) com data de conclusão → rejeitado.
    expect(
      periciaCreateSchema.safeParse({ ...base, estado: 'EM_CURSO', dataConclusao: '2026-02-01' })
        .success,
    ).toBe(false)
    // Sem estado (assume SOLICITADA) com data de conclusão → rejeitado.
    expect(periciaCreateSchema.safeParse({ ...base, dataConclusao: '2026-02-01' }).success).toBe(
      false,
    )
    // Concluída com data de conclusão → aceite.
    expect(
      periciaCreateSchema.safeParse({ ...base, estado: 'CONCLUIDA', dataConclusao: '2026-02-01' })
        .success,
    ).toBe(true)
    // Cancelada também é terminal.
    expect(
      periciaCreateSchema.safeParse({ ...base, estado: 'CANCELADA', dataConclusao: '2026-02-01' })
        .success,
    ).toBe(true)
  })

  test('dataConclusao não pode ser anterior ao pedido', () => {
    expect(
      periciaCreateSchema.safeParse({
        ...base,
        dataPedido: '2026-03-10',
        estado: 'CONCLUIDA',
        dataConclusao: '2026-03-01',
      }).success,
    ).toBe(false)
  })

  test('dataPrevista não pode ser anterior ao pedido', () => {
    expect(
      periciaCreateSchema.safeParse({ ...base, dataPedido: '2026-03-10', dataPrevista: '2026-03-01' })
        .success,
    ).toBe(false)
    expect(
      periciaCreateSchema.safeParse({ ...base, dataPedido: '2026-03-01', dataPrevista: '2026-03-20' })
        .success,
    ).toBe(true)
  })
})

describe('mapas de labels', () => {
  test('todos os tipos têm label', () => {
    for (const t of TIPO_PERICIA) expect(TIPO_PERICIA_LABEL[t]).toBeTruthy()
  })

  test('todos os estados têm label', () => {
    for (const e of ESTADO_PERICIA) expect(ESTADO_PERICIA_LABEL[e]).toBeTruthy()
  })

  test('os estados terminais são exatamente concluída/cancelada', () => {
    expect([...ESTADO_PERICIA_TERMINAL].sort()).toEqual(['CANCELADA', 'CONCLUIDA'].sort())
    expect(ESTADO_PERICIA_TERMINAL.has('SOLICITADA')).toBe(false)
    expect(ESTADO_PERICIA_TERMINAL.has('EM_CURSO')).toBe(false)
  })
})
