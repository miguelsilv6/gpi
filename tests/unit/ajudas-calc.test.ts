import { describe, test, expect } from 'vitest'
import { calcAjudasTotais, calcLinhaValor, type ConfigData, type LinhaWithData } from '@/lib/ajudas-calc'

const BASE_CONFIG: ConfigData = {
  vencimentoE25: 1200,
  vencimentoDN: 1200,
  percentPiqueteSemana: 0.05,
  percentPiqueteFds: 0.1,
  percentPrevencaoPassiva: 0.4,
  senhaAlmoco: 5,
  senhaJantar: 6,
  senhaCeia: 4,
  taxaIRS: 0.2,
  taxaSS: 0.11,
  distanciaMinKmAjudas: 35,
}

// Segunda-feira, dia de semana — fora de feriados.
const ANO = 2025
const MES = 3
const DIA_SEMANA = new Date(Date.UTC(ANO, MES - 1, 3, 0, 0, 0, 0))

function linhaPiquete(overrides: Partial<LinhaWithData> = {}): LinhaWithData {
  return {
    dataInicio: DIA_SEMANA,
    dataFim: new Date(Date.UTC(ANO, MES - 1, 3, 23, 59, 0, 0)),
    prevencao: 'PIQUETE',
    prevencaoOnly: true,
    ajudaCustoAlmoco: 0,
    ajudaCustoJantar: 1,
    ajudaCustoCeia: 1,
    senhaAlmoco: 0,
    senhaJantar: 0,
    senhaCeia: 0,
    km: 0,
    ...overrides,
  }
}

function linhaHorasExtra(overrides: Partial<LinhaWithData> = {}): LinhaWithData {
  return {
    dataInicio: DIA_SEMANA,
    dataFim: new Date(Date.UTC(ANO, MES - 1, 3, 20, 0, 0, 0)),
    prevencao: 'NENHUMA',
    prevencaoOnly: false,
    ajudaCustoAlmoco: 0,
    ajudaCustoJantar: 1,
    ajudaCustoCeia: 1,
    senhaAlmoco: 0,
    senhaJantar: 0,
    senhaCeia: 0,
    km: 0,
    ...overrides,
  }
}

describe('calcAjudasTotais — ajudas de custo em entradas de Piquete', () => {
  test('uma entrada de Piquete com km=0 conta jantar e ceia mesmo sem atingir a distância mínima', () => {
    const totais = calcAjudasTotais([linhaPiquete()], BASE_CONFIG, BASE_CONFIG.taxaIRS, ANO, MES)
    expect(totais.ajudaCustoJantar).toBe(1)
    expect(totais.ajudaCustoCeia).toBe(1)
    expect(totais.ajudaCustoAlmoco).toBe(0)
    expect(totais.totalAjudasCusto).toBe(1 * BASE_CONFIG.senhaJantar + 1 * BASE_CONFIG.senhaCeia)
  })

  test('uma entrada normal (não-Piquete) com km abaixo do mínimo continua sem ajudas de custo', () => {
    const totais = calcAjudasTotais([linhaHorasExtra({ km: 10 })], BASE_CONFIG, BASE_CONFIG.taxaIRS, ANO, MES)
    expect(totais.ajudaCustoJantar).toBe(0)
    expect(totais.ajudaCustoCeia).toBe(0)
    expect(totais.totalAjudasCusto).toBe(0)
  })

  test('uma entrada normal com km acima do mínimo continua a contar ajudas de custo', () => {
    const totais = calcAjudasTotais([linhaHorasExtra({ km: 40 })], BASE_CONFIG, BASE_CONFIG.taxaIRS, ANO, MES)
    expect(totais.ajudaCustoJantar).toBe(1)
    expect(totais.ajudaCustoCeia).toBe(1)
  })

  test('uma entrada de Piquete com almoço guardado e km abaixo do mínimo NÃO conta o almoço', () => {
    // Defesa contra a relaxação do gate de km ter sido aplicada a todas as
    // refeições em vez de só jantar/ceia.
    const totais = calcAjudasTotais([linhaPiquete({ ajudaCustoAlmoco: 1 })], BASE_CONFIG, BASE_CONFIG.taxaIRS, ANO, MES)
    expect(totais.ajudaCustoAlmoco).toBe(0)
  })

  test('uma entrada de Piquete antiga, sem jantar/ceia guardados, ainda assim conta jantar e ceia', () => {
    // Registos criados antes desta regra existir têm ajudaCustoJantar/Ceia=0
    // guardado — o motor de cálculo deve derivar 1/1 a partir de prevencao,
    // não confiar apenas no valor persistido na linha.
    const totais = calcAjudasTotais(
      [linhaPiquete({ ajudaCustoJantar: 0, ajudaCustoCeia: 0 })],
      BASE_CONFIG,
      BASE_CONFIG.taxaIRS,
      ANO,
      MES,
    )
    expect(totais.ajudaCustoJantar).toBe(1)
    expect(totais.ajudaCustoCeia).toBe(1)
  })
})

describe('calcLinhaValor — ajudas de custo em entradas de Piquete', () => {
  test('o valor da linha de Piquete inclui jantar e ceia mesmo com km=0', () => {
    const valor = calcLinhaValor(linhaPiquete(), BASE_CONFIG, ANO, MES)
    const taxaPiqueteSemana = BASE_CONFIG.vencimentoE25 * BASE_CONFIG.percentPiqueteSemana
    const ajudas = BASE_CONFIG.senhaJantar + BASE_CONFIG.senhaCeia
    expect(valor).toBeCloseTo(taxaPiqueteSemana + ajudas, 6)
  })

  test('uma entrada normal com km abaixo do mínimo não inclui ajudas de custo no valor', () => {
    // prevencaoOnly isola o bloco de ajudas de custo, sem horas extra nem piquete a somar.
    const valor = calcLinhaValor(linhaHorasExtra({ km: 10, prevencaoOnly: true }), BASE_CONFIG, ANO, MES)
    expect(valor).toBe(0)
  })
})
