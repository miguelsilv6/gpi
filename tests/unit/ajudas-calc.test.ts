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

describe('Prevenção passiva que atravessa dois meses — dividida por mês', () => {
  // Prevenção de 29/05/2025 (Qui) a 02/06/2025 (Seg), sem feriados no intervalo:
  //   Maio: 29 Qui, 30 Sex (semana) + 31 Sáb (FdS)  → 2 semana, 1 FdS
  //   Junho: 01 Dom (FdS) + 02 Seg (semana)          → 1 semana, 1 FdS
  const prevencaoCrossMonth: LinhaWithData = {
    dataInicio: new Date(Date.UTC(2025, 4, 29, 0, 0, 0, 0)),
    dataFim: new Date(Date.UTC(2025, 5, 2, 23, 59, 0, 0)),
    prevencao: 'PREVENCAO_PASSIVA',
    prevencaoOnly: true,
    ajudaCustoAlmoco: 0,
    ajudaCustoJantar: 0,
    ajudaCustoCeia: 0,
    senhaAlmoco: 0,
    senhaJantar: 0,
    senhaCeia: 0,
    km: 0,
  }

  const taxaPrevSemana = BASE_CONFIG.vencimentoE25 * BASE_CONFIG.percentPiqueteSemana * BASE_CONFIG.percentPrevencaoPassiva // 24
  const taxaPrevFds = BASE_CONFIG.vencimentoE25 * BASE_CONFIG.percentPiqueteFds * BASE_CONFIG.percentPrevencaoPassiva // 48

  test('os dias de cada mês são contados apenas no respetivo mês', () => {
    const maio = calcAjudasTotais([prevencaoCrossMonth], BASE_CONFIG, 0.2, 2025, 5)
    expect(maio.prevencaoSemana).toBe(2)
    expect(maio.prevencaoFds).toBe(1)

    const junho = calcAjudasTotais([prevencaoCrossMonth], BASE_CONFIG, 0.2, 2025, 6)
    expect(junho.prevencaoSemana).toBe(1)
    expect(junho.prevencaoFds).toBe(1)

    // Somando os dois meses obtêm-se os 5 dias do intervalo completo.
    expect(maio.prevencaoSemana + maio.prevencaoFds + junho.prevencaoSemana + junho.prevencaoFds).toBe(5)
  })

  test('calcLinhaValor atribui a cada mês só o valor dos seus dias', () => {
    const valMaio = calcLinhaValor(prevencaoCrossMonth, BASE_CONFIG, 2025, 5)
    const valJunho = calcLinhaValor(prevencaoCrossMonth, BASE_CONFIG, 2025, 6)
    expect(valMaio).toBeCloseTo(2 * taxaPrevSemana + 1 * taxaPrevFds, 6) // 96
    expect(valJunho).toBeCloseTo(1 * taxaPrevSemana + 1 * taxaPrevFds, 6) // 72
  })
})

describe('Horas extra que cruzam a meia-noite na fronteira do mês', () => {
  // Turno 31/05/2025 (Sáb) 22:00 → 01/06/2025 (Dom) 02:00, sem feriados:
  //   Maio: 22-24h de Sáb       → 2h FdS-dia
  //   Junho: 00-02h de Dom      → 2h FdS-noite
  const turnoCrossMonth: LinhaWithData = {
    dataInicio: new Date(Date.UTC(2025, 4, 31, 22, 0, 0, 0)),
    dataFim: new Date(Date.UTC(2025, 5, 1, 2, 0, 0, 0)),
    prevencao: 'NENHUMA',
    prevencaoOnly: false,
    ajudaCustoAlmoco: 0,
    ajudaCustoJantar: 0,
    ajudaCustoCeia: 0,
    senhaAlmoco: 0,
    senhaJantar: 0,
    senhaCeia: 0,
    km: 0,
  }

  const taxaFdsDia = (BASE_CONFIG.vencimentoE25 * BASE_CONFIG.percentPiqueteFds) / 12 // 10
  const taxaFdsNoite = taxaFdsDia * 2 // 20

  test('cada mês conta apenas as horas trabalhadas nesse mês', () => {
    const maio = calcAjudasTotais([turnoCrossMonth], BASE_CONFIG, 0.2, 2025, 5)
    expect(maio.fdsDia).toBeCloseTo(2, 6)
    expect(maio.fdsNoite).toBeCloseTo(0, 6)
    expect(maio.totalHorasExtra).toBeCloseTo(2 * taxaFdsDia, 6) // 20

    const junho = calcAjudasTotais([turnoCrossMonth], BASE_CONFIG, 0.2, 2025, 6)
    expect(junho.fdsNoite).toBeCloseTo(2, 6)
    expect(junho.fdsDia).toBeCloseTo(0, 6)
    expect(junho.totalHorasExtra).toBeCloseTo(2 * taxaFdsNoite, 6) // 40
  })

  test('calcLinhaValor atribui a cada mês só o valor das horas desse mês', () => {
    expect(calcLinhaValor(turnoCrossMonth, BASE_CONFIG, 2025, 5)).toBeCloseTo(2 * taxaFdsDia, 6) // 20
    expect(calcLinhaValor(turnoCrossMonth, BASE_CONFIG, 2025, 6)).toBeCloseTo(2 * taxaFdsNoite, 6) // 40
  })
})
