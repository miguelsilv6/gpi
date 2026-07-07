import { describe, test, expect } from 'vitest'
import {
  intercecaoAlvoCreateSchema,
  intercecaoAlvoUpdateSchema,
  intercecaoLinhaCreateSchema,
  intercecaoProdutoCreateSchema,
  intercecaoProdutoUpdateSchema,
  intercecaoRenovarSchema,
  TIPO_LINHA_LABEL,
  TIPO_PRODUTO_LABEL,
  TIPO_PRODUTO_BADGE,
  DIRECAO_LABEL,
  HORA_REGEX,
  DURACAO_REGEX,
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
    expect(intercecaoAlvoCreateSchema.safeParse({ nome: '' }).success).toBe(false)
    const ok = intercecaoAlvoCreateSchema.safeParse({ nome: 'X', observacoes: '' })
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
    const base = { codigo: '1', tipo: 'SIM', identificador: '912345678' }
    expect(
      intercecaoLinhaCreateSchema.safeParse({ ...base, dataInicio: '2026-07-10', dataFim: '2026-07-01' }).success,
    ).toBe(false)
    expect(
      intercecaoLinhaCreateSchema.safeParse({ ...base, dataInicio: '2026-07-01', dataFim: '2026-07-01' }).success,
    ).toBe(true)
  })

  test('linha create: código obrigatório (cada linha tem o seu próprio código)', () => {
    const base = { tipo: 'SIM', identificador: '912345678', dataInicio: '2026-01-01', dataFim: '2026-06-01' }
    expect(intercecaoLinhaCreateSchema.safeParse(base).success).toBe(false) // codigo omitido
    expect(intercecaoLinhaCreateSchema.safeParse({ ...base, codigo: '' }).success).toBe(false)
    expect(intercecaoLinhaCreateSchema.safeParse({ ...base, codigo: '1' }).success).toBe(true)
  })

  test('linha create: alertaDias fora de 0..365 é rejeitado; null é aceite (desligado)', () => {
    const base = { codigo: '1', tipo: 'IMEI', identificador: 'x', dataInicio: '2026-01-01', dataFim: '2026-06-01' }
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

  test('HORA_REGEX: aceita segundos opcionais (HH:mm:ss)', () => {
    expect(HORA_REGEX.test('14:30:00')).toBe(true)
    expect(HORA_REGEX.test('23:59:59')).toBe(true)
    expect(HORA_REGEX.test('14:30:60')).toBe(false)
    expect(HORA_REGEX.test('24:00:00')).toBe(false)
  })

  test('produto create: hora com segundos é aceite', () => {
    const base = { tipo: 'CHAMADA', data: '2026-05-05', resumo: 'ok' }
    expect(intercecaoProdutoCreateSchema.safeParse({ ...base, horaInicio: '14:30:15' }).success).toBe(true)
    expect(intercecaoProdutoCreateSchema.safeParse({ ...base, horaInicio: '14:30:60' }).success).toBe(false)
  })

  test('DURACAO_REGEX: mm:ss e hh:mm:ss; segundos 00-59', () => {
    expect(DURACAO_REGEX.test('03:45')).toBe(true)
    expect(DURACAO_REGEX.test('00:00')).toBe(true)
    expect(DURACAO_REGEX.test('120:30')).toBe(true) // minutos podem exceder 60
    expect(DURACAO_REGEX.test('1:02:03')).toBe(true)
    expect(DURACAO_REGEX.test('03:60')).toBe(false) // segundos inválidos
    expect(DURACAO_REGEX.test('3m45s')).toBe(false)
    expect(DURACAO_REGEX.test('45')).toBe(false)
  })

  test('produto create: duração válida; "" → undefined; paraTranscricao booleano', () => {
    const base = { tipo: 'CHAMADA', data: '2026-05-05', resumo: 'ok' }
    expect(intercecaoProdutoCreateSchema.safeParse({ ...base, duracao: '02:15' }).success).toBe(true)
    expect(intercecaoProdutoCreateSchema.safeParse({ ...base, duracao: 'xpto' }).success).toBe(false)
    const ok = intercecaoProdutoCreateSchema.safeParse({ ...base, duracao: '', paraTranscricao: true })
    expect(ok.success).toBe(true)
    if (ok.success) {
      expect(ok.data.duracao).toBeUndefined()
      expect(ok.data.paraTranscricao).toBe(true)
    }
  })

  test('produto update: duração e paraTranscricao opcionais', () => {
    expect(intercecaoProdutoUpdateSchema.safeParse({ paraTranscricao: false }).success).toBe(true)
    expect(intercecaoProdutoUpdateSchema.safeParse({ duracao: '10:00' }).success).toBe(true)
    expect(intercecaoProdutoUpdateSchema.safeParse({ duracao: 'nope' }).success).toBe(false)
  })

  test('alvo create/update: notas', () => {
    const created = intercecaoAlvoCreateSchema.safeParse({ nome: 'X', notas: '' })
    expect(created.success).toBe(true)
    if (created.success) expect(created.data.notas).toBeUndefined()
    // update mantém "" (limpar) vs omitido
    const upd = intercecaoAlvoUpdateSchema.safeParse({ notas: 'relevante' })
    expect(upd.success).toBe(true)
    if (upd.success) expect(upd.data.notas).toBe('relevante')
  })

  test('alvo create/update: acompanhamento', () => {
    const created = intercecaoAlvoCreateSchema.safeParse({ nome: 'X', acompanhamento: '' })
    expect(created.success).toBe(true)
    if (created.success) expect(created.data.acompanhamento).toBeUndefined()
    // update mantém "" (limpar) vs omitido
    const upd = intercecaoAlvoUpdateSchema.safeParse({ acompanhamento: 'revisto até 05/06, retomar produto #12' })
    expect(upd.success).toBe(true)
    if (upd.success) expect(upd.data.acompanhamento).toBe('revisto até 05/06, retomar produto #12')
    const omitted = intercecaoAlvoUpdateSchema.safeParse({})
    expect(omitted.success).toBe(true)
    if (omitted.success) expect(omitted.data.acompanhamento).toBeUndefined()
  })

  test('renovar: novaDataFim obrigatória', () => {
    expect(intercecaoRenovarSchema.safeParse({ novaDataFim: '' }).success).toBe(false)
    expect(intercecaoRenovarSchema.safeParse({ novaDataFim: '2026-08-01' }).success).toBe(true)
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
