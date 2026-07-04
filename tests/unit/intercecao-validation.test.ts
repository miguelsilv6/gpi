import { describe, test, expect } from 'vitest'
import {
  intercecaoAlvoCreateSchema,
  intercecaoAlvoUpdateSchema,
  intercecaoLinhaCreateSchema,
  intercecaoProdutoCreateSchema,
  TIPO_LINHA_LABEL,
  TIPO_PRODUTO_LABEL,
  TIPO_PRODUTO_BADGE,
  DIRECAO_LABEL,
  HORA_REGEX,
  estadoLinha,
  alertasDevidos,
  resetAlertFlagsOnUpdate,
} from '@/lib/validations/intercecao'
import {
  TipoLinhaIntercecao,
  TipoProdutoIntercecao,
  DirecaoProdutoIntercecao,
} from '@/generated/prisma/enums'

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

describe('mapas de labels — exaustivos contra os enums', () => {
  test('TipoLinhaIntercecao', () => {
    for (const v of Object.values(TipoLinhaIntercecao)) {
      expect(TIPO_LINHA_LABEL[v], `label em falta: ${v}`).toBeTruthy()
    }
  })
  test('TipoProdutoIntercecao (label + badge)', () => {
    for (const v of Object.values(TipoProdutoIntercecao)) {
      expect(TIPO_PRODUTO_LABEL[v], `label em falta: ${v}`).toBeTruthy()
      expect(TIPO_PRODUTO_BADGE[v], `badge em falta: ${v}`).toBeTruthy()
    }
  })
  test('DirecaoProdutoIntercecao', () => {
    for (const v of Object.values(DirecaoProdutoIntercecao)) {
      expect(DIRECAO_LABEL[v], `label em falta: ${v}`).toBeTruthy()
    }
  })
})

describe('schemas', () => {
  test('alvo create: obrigatórios + "" → undefined nas observações', () => {
    expect(intercecaoAlvoCreateSchema.safeParse({ nome: '', codigo: '1' }).success).toBe(false)
    expect(intercecaoAlvoCreateSchema.safeParse({ nome: 'X', codigo: '' }).success).toBe(false)
    const ok = intercecaoAlvoCreateSchema.safeParse({ nome: 'X', codigo: '123', observacoes: '' })
    expect(ok.success).toBe(true)
    if (ok.success) expect(ok.data.observacoes).toBeUndefined()
  })

  test('alvo update: campos omitidos ficam omitidos; "" preserva-se (limpar)', () => {
    const parsed = intercecaoAlvoUpdateSchema.safeParse({ observacoes: '' })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.observacoes).toBe('')
      expect(parsed.data.nome).toBeUndefined()
    }
  })

  test('linha create: dataFim >= dataInicio (refine)', () => {
    const base = { tipo: 'SIM', identificador: '912345678' }
    expect(
      intercecaoLinhaCreateSchema.safeParse({ ...base, dataInicio: '2026-07-10', dataFim: '2026-07-01' }).success,
    ).toBe(false)
    expect(
      intercecaoLinhaCreateSchema.safeParse({ ...base, dataInicio: '2026-07-01', dataFim: '2026-07-01' }).success,
    ).toBe(true)
  })

  test('linha create: alertaDias fora de 0..365 é rejeitado; null é aceite (desligado)', () => {
    const base = { tipo: 'IMEI', identificador: 'x', dataInicio: '2026-01-01', dataFim: '2026-06-01' }
    expect(intercecaoLinhaCreateSchema.safeParse({ ...base, alertaDias1: -1 }).success).toBe(false)
    expect(intercecaoLinhaCreateSchema.safeParse({ ...base, alertaDias1: 366 }).success).toBe(false)
    expect(intercecaoLinhaCreateSchema.safeParse({ ...base, alertaDias1: null, alertaDias2: 0 }).success).toBe(true)
  })

  test('produto create: horas HH:mm válidas; resumo obrigatório', () => {
    const base = { tipo: 'CHAMADA', data: '2026-05-05', resumo: 'ok' }
    expect(intercecaoProdutoCreateSchema.safeParse({ ...base, horaInicio: '09:30' }).success).toBe(true)
    expect(intercecaoProdutoCreateSchema.safeParse({ ...base, horaInicio: '9:30' }).success).toBe(false)
    expect(intercecaoProdutoCreateSchema.safeParse({ ...base, horaInicio: '24:00' }).success).toBe(false)
    expect(intercecaoProdutoCreateSchema.safeParse({ ...base, horaInicio: '23:59' }).success).toBe(true)
    expect(intercecaoProdutoCreateSchema.safeParse({ tipo: 'SMS', data: '2026-05-05', resumo: '' }).success).toBe(false)
  })

  test('HORA_REGEX: fronteiras', () => {
    expect(HORA_REGEX.test('00:00')).toBe(true)
    expect(HORA_REGEX.test('23:59')).toBe(true)
    expect(HORA_REGEX.test('24:00')).toBe(false)
    expect(HORA_REGEX.test('12:60')).toBe(false)
  })
})

describe('estadoLinha', () => {
  test('ativa até ao próprio dia do fim; terminada depois', () => {
    expect(estadoLinha(daysFromNow(0))).toBe('ativa')
    expect(estadoLinha(daysFromNow(5))).toBe('ativa')
    expect(estadoLinha(daysFromNow(-1))).toBe('terminada')
  })
})

describe('alertasDevidos', () => {
  const base = { alerta1Enviado: false, alerta2Enviado: false }

  test('fronteira: dias restantes == alertaDias dispara', () => {
    expect(alertasDevidos({ ...base, dataFim: daysFromNow(10), alertaDias1: 10, alertaDias2: 3 })).toEqual([1])
  })

  test('fora do limiar não dispara; dentro dos dois dispara ambos', () => {
    expect(alertasDevidos({ ...base, dataFim: daysFromNow(11), alertaDias1: 10, alertaDias2: 3 })).toEqual([])
    expect(alertasDevidos({ ...base, dataFim: daysFromNow(2), alertaDias1: 10, alertaDias2: 3 })).toEqual([1, 2])
  })

  test('flag enviado suprime; null (desligado) nunca dispara', () => {
    expect(
      alertasDevidos({ dataFim: daysFromNow(2), alertaDias1: 10, alertaDias2: 3, alerta1Enviado: true, alerta2Enviado: false }),
    ).toEqual([2])
    expect(alertasDevidos({ ...base, dataFim: daysFromNow(2), alertaDias1: null, alertaDias2: null })).toEqual([])
  })

  test('vencida e não enviada dispara (sem limite inferior)', () => {
    expect(alertasDevidos({ ...base, dataFim: daysFromNow(-30), alertaDias1: 10, alertaDias2: null })).toEqual([1])
  })
})

describe('resetAlertFlagsOnUpdate', () => {
  const before = { dataFim: daysFromNow(5), alertaDias1: 10, alertaDias2: 3 }

  test('mudar dataFim repõe os dois flags', () => {
    expect(resetAlertFlagsOnUpdate(before, { dataFim: daysFromNow(30) })).toEqual({
      alerta1Enviado: false,
      alerta2Enviado: false,
    })
  })

  test('dataFim igual não repõe nada', () => {
    expect(resetAlertFlagsOnUpdate(before, { dataFim: new Date(before.dataFim) })).toEqual({})
  })

  test('mudar só os dias de um aviso repõe apenas esse flag', () => {
    expect(resetAlertFlagsOnUpdate(before, { alertaDias1: 15 })).toEqual({ alerta1Enviado: false })
    expect(resetAlertFlagsOnUpdate(before, { alertaDias2: null })).toEqual({ alerta2Enviado: false })
    expect(resetAlertFlagsOnUpdate(before, { alertaDias1: 10 })).toEqual({})
  })

  test('campos omitidos não repõem', () => {
    expect(resetAlertFlagsOnUpdate(before, {})).toEqual({})
  })
})
