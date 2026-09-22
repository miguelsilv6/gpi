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
  datasValidacoes,
  numeroControlo,
  numeroValidacaoRenovacao,
  normalizarContacto,
  intercecaoPlanoSchema,
  intercecaoRelacaoCreateSchema,
  intercecaoRelacaoUpdateSchema,
  intercecaoOuvidoAteSchema,
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

  test('produto create: duração válida; "" → undefined; estado de transcrição', () => {
    const base = { tipo: 'VOZ', data: '2026-05-05', resumo: 'ok' }
    expect(intercecaoProdutoCreateSchema.safeParse({ ...base, duracao: '02:15' }).success).toBe(true)
    expect(intercecaoProdutoCreateSchema.safeParse({ ...base, duracao: 'xpto' }).success).toBe(false)
    const ok = intercecaoProdutoCreateSchema.safeParse({ ...base, duracao: '', transcricao: 'PEDIDA' })
    expect(ok.success).toBe(true)
    if (ok.success) {
      expect(ok.data.duracao).toBeUndefined()
      expect(ok.data.transcricao).toBe('PEDIDA')
    }
    // Estado fora do enum é rejeitado (o antigo booleano também).
    expect(intercecaoProdutoCreateSchema.safeParse({ ...base, transcricao: 'SIM' }).success).toBe(false)
  })

  test('produto create: ID do produto e identificações do de/para', () => {
    const parsed = intercecaoProdutoCreateSchema.safeParse({
      tipo: 'RAW',
      data: '2026-05-05',
      resumo: 'ok',
      idProduto: '870155919242722000',
      de: '928022089',
      identificacaoDe: 'Miguel Viegas',
      identificacaoPara: '',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.idProduto).toBe('870155919242722000')
      expect(parsed.data.identificacaoDe).toBe('Miguel Viegas')
      expect(parsed.data.identificacaoPara).toBeUndefined()
    }
  })

  test('produto update: duração e estado de transcrição opcionais', () => {
    expect(intercecaoProdutoUpdateSchema.safeParse({ transcricao: 'AUTORIZADA' }).success).toBe(true)
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

describe('validações quinzenais e lotes de controlo', () => {
  const PRIMEIRA = new Date('2026-06-17T00:00:00Z')

  test('datasValidacoes: 14 dias mantêm sempre o mesmo dia da semana', () => {
    const datas = datasValidacoes(PRIMEIRA, 14, new Date('2026-10-06T00:00:00Z'))
    // Todas quartas-feiras, como no controlo em papel.
    for (const d of datas) expect(d.getUTCDay()).toBe(PRIMEIRA.getUTCDay())
    expect(datas[0].toISOString().slice(0, 10)).toBe('2026-06-17')
    expect(datas[1].toISOString().slice(0, 10)).toBe('2026-07-01')
    expect(datas[5].toISOString().slice(0, 10)).toBe('2026-08-26')
  })

  test('datasValidacoes: gera sempre uma para lá do horizonte', () => {
    const ate = new Date('2026-07-01T00:00:00Z') // exatamente a 2.ª validação
    const datas = datasValidacoes(PRIMEIRA, 14, ate)
    expect(datas).toHaveLength(3)
    expect(datas.at(-1)!.toISOString().slice(0, 10)).toBe('2026-07-15')
  })

  test('numeroControlo: o produto do dia da validação já conta para o lote seguinte', () => {
    const datas = datasValidacoes(PRIMEIRA, 14, new Date('2026-07-20T00:00:00Z'))
    // Antes da 1.ª validação.
    expect(numeroControlo(new Date('2026-06-08T00:00:00Z'), datas)).toBe(1)
    // No próprio dia da 1.ª → 2.º Controlo (a apresentação leva o que veio antes).
    expect(numeroControlo(new Date('2026-06-17T00:00:00Z'), datas)).toBe(2)
    expect(numeroControlo(new Date('2026-06-29T00:00:00Z'), datas)).toBe(2)
    // Depois da 2.ª (01/07) → 3.º Controlo.
    expect(numeroControlo(new Date('2026-07-04T00:00:00Z'), datas)).toBe(3)
  })

  test('numeroControlo: sem validações, tudo fica no 1.º lote', () => {
    expect(numeroControlo(new Date('2026-07-04T00:00:00Z'), [])).toBe(1)
  })

  test('numeroValidacaoRenovacao: reproduz as renovações do controlo em papel', () => {
    // Alvo que termina a 05/09 → prepara-se na 6.ª validação (26/08).
    expect(numeroValidacaoRenovacao(PRIMEIRA, 14, new Date('2026-09-05T00:00:00Z'))).toBe(6)
    // Alvo que termina a 06/10 → 8.ª validação (23/09).
    expect(numeroValidacaoRenovacao(PRIMEIRA, 14, new Date('2026-10-06T00:00:00Z'))).toBe(8)
  })

  test('numeroValidacaoRenovacao: fim que cai numa validação usa a anterior', () => {
    // O fim é no próprio dia da 2.ª validação: a renovação tem de estar pedida
    // antes disso, logo prepara-se na 1.ª.
    expect(numeroValidacaoRenovacao(PRIMEIRA, 14, new Date('2026-07-01T00:00:00Z'))).toBe(1)
  })

  test('numeroValidacaoRenovacao: fim antes da 1.ª validação não tem onde ser preparada', () => {
    expect(numeroValidacaoRenovacao(PRIMEIRA, 14, new Date('2026-06-10T00:00:00Z'))).toBeNull()
    expect(numeroValidacaoRenovacao(PRIMEIRA, 14, PRIMEIRA)).toBeNull()
  })

  test('plano: data obrigatória, intervalo e alerta dentro dos limites', () => {
    expect(intercecaoPlanoSchema.safeParse({ dataPrimeira: '2026-06-17' }).success).toBe(true)
    expect(intercecaoPlanoSchema.safeParse({ dataPrimeira: '' }).success).toBe(false)
    expect(
      intercecaoPlanoSchema.safeParse({ dataPrimeira: '2026-06-17', intervaloDias: 0 }).success,
    ).toBe(false)
    expect(
      intercecaoPlanoSchema.safeParse({ dataPrimeira: '2026-06-17', intervaloDias: 91 }).success,
    ).toBe(false)
    expect(
      intercecaoPlanoSchema.safeParse({ dataPrimeira: '2026-06-17', alertaDias: 0 }).success,
    ).toBe(true)
  })
})

describe('normalizarContacto', () => {
  test('descarta a formatação para que o mesmo número seja um só contacto', () => {
    expect(normalizarContacto('928 022 089')).toBe('928022089')
    expect(normalizarContacto(' 928-022.089 ')).toBe('928022089')
  })

  test('mantém o indicativo — não adivinha que "+351…" é o mesmo número', () => {
    expect(normalizarContacto('+351 928022089')).toBe('+351928022089')
    expect(normalizarContacto('+351928022089')).not.toBe(normalizarContacto('928022089'))
  })

  test('texto sem dígitos fica vazio (rejeitado na rota)', () => {
    expect(normalizarContacto('desconhecido')).toBe('')
  })
})

describe('relação: schemas', () => {
  test('create: contacto obrigatório; campos vazios → undefined', () => {
    expect(intercecaoRelacaoCreateSchema.safeParse({ contacto: '' }).success).toBe(false)
    const ok = intercecaoRelacaoCreateSchema.safeParse({
      contacto: '928022089',
      nome: 'Miguel Viegas',
      morada: '',
    })
    expect(ok.success).toBe(true)
    if (ok.success) {
      expect(ok.data.nome).toBe('Miguel Viegas')
      expect(ok.data.morada).toBeUndefined()
    }
  })

  test('update: tudo opcional, mas contacto não pode ficar vazio', () => {
    expect(intercecaoRelacaoUpdateSchema.safeParse({}).success).toBe(true)
    expect(intercecaoRelacaoUpdateSchema.safeParse({ nome: '' }).success).toBe(true)
    expect(intercecaoRelacaoUpdateSchema.safeParse({ contacto: '' }).success).toBe(false)
  })
})

describe('ouvido até: schema', () => {
  test('data obrigatória; horas validadas; vazios → undefined', () => {
    expect(intercecaoOuvidoAteSchema.safeParse({ data: '' }).success).toBe(false)
    expect(intercecaoOuvidoAteSchema.safeParse({ data: '2026-08-27', horaInicio: '25:00' }).success).toBe(false)
    const ok = intercecaoOuvidoAteSchema.safeParse({
      data: '2026-08-27',
      numeroProduto: '70623',
      horaInicio: '14:49:38',
      horaFim: '',
    })
    expect(ok.success).toBe(true)
    if (ok.success) {
      expect(ok.data.numeroProduto).toBe('70623')
      expect(ok.data.horaInicio).toBe('14:49:38')
      expect(ok.data.horaFim).toBeUndefined()
    }
  })
})
