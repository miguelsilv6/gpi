import { describe, test, expect } from 'vitest'
import {
  buildIntercecoesWorkbook,
  buildTranscricaoWorkbook,
  anotarRenovacoes,
  resolverIdentificacoes,
  type XlsxData,
  type XlsxProduto,
  type TranscricaoData,
} from '@/lib/intercecoes-xlsx'

/**
 * Os dados espelham o controlo em papel: duas linhas do mesmo suspeito (uma de
 * cartão, outra de equipamento), produtos de lados diferentes de uma validação
 * e um contacto fichado nas Relações.
 */
function sampleData(): XlsxData {
  const validacoes = [
    new Date('2026-06-17T00:00:00Z'),
    new Date('2026-07-01T00:00:00Z'),
    new Date('2026-07-15T00:00:00Z'),
  ]
  return {
    nuipc: '123/24.0GBABC',
    alvos: [
      {
        nome: 'Nome 1',
        observacoes: 'obs do alvo',
        notas: 'nota livre do inspetor',
        linhas: [
          {
            codigo: '145779040',
            tipo: 'SIM',
            identificador: '912345678',
            rede: 'DIGI',
            dataOficio: new Date('2026-06-05T00:00:00Z'),
            dataInicio: new Date('2026-06-05T00:00:00Z'),
            dataFim: new Date('2026-09-05T00:00:00Z'),
            renovacoes: 2,
            observacoes: null,
            ouvidoAte: {
              numeroProduto: '70623',
              data: new Date('2026-08-27T00:00:00Z'),
              horaInicio: '14:49',
              horaFim: null,
            },
          },
          {
            codigo: '146093080',
            tipo: 'IMEI',
            identificador: '350000000000000',
            rede: 'DIGI',
            dataOficio: null,
            dataInicio: new Date('2026-07-06T00:00:00Z'),
            dataFim: new Date('2026-10-06T00:00:00Z'),
            renovacoes: 0,
            observacoes: null,
            ouvidoAte: null,
          },
        ],
        produtos: [
          {
            // Antes da 1.ª validação → 1.º Controlo.
            tipo: 'RAW',
            numeroProduto: '383',
            idProduto: '870437343793137000',
            direcao: null,
            data: new Date('2026-06-08T00:00:00Z'),
            horaInicio: '19:07:39',
            horaFim: null,
            duracao: null,
            transcricao: 'AUTORIZADA',
            de: null,
            identificacaoDe: null,
            para: null,
            identificacaoPara: null,
            resumo: 'Sessão em bruto',
            comentarios: null,
            linha: { identificador: '912345678', codigo: '145779040' },
          },
          {
            // No dia da 1.ª validação → já conta para o 2.º Controlo.
            tipo: 'VOZ',
            numeroProduto: '7737',
            idProduto: '870155919242722000',
            direcao: 'EFETUADA',
            data: new Date('2026-06-17T00:00:00Z'),
            horaInicio: '16:47:54',
            horaFim: null,
            duracao: '02:10',
            transcricao: 'NENHUMA',
            de: '928022089',
            identificacaoDe: null,
            para: '963386293',
            identificacaoPara: 'Empresa de Mudanças',
            resumo: 'Combina transporte',
            comentarios: null,
            linha: { identificador: '912345678', codigo: '145779040' },
          },
          {
            // Depois da 2.ª validação → 3.º Controlo.
            tipo: 'VOZ',
            numeroProduto: '32797',
            idProduto: '870156014461326837',
            direcao: 'RECEBIDA',
            data: new Date('2026-07-04T00:00:00Z'),
            horaInicio: '12:23:15',
            horaFim: null,
            duracao: null,
            transcricao: 'PEDIDA',
            de: '935615162',
            identificacaoDe: 'Mãe',
            para: '928022089',
            identificacaoPara: null,
            resumo: 'Conversa familiar',
            comentarios: null,
            linha: { identificador: '912345678', codigo: '145779040' },
          },
        ],
      },
      {
        // Alvo sem linhas nem produtos: continua a aparecer na folha "Alvo".
        nome: 'Nome 2',
        observacoes: null,
        notas: null,
        linhas: [],
        produtos: [],
      },
    ],
    relacoes: [
      {
        contacto: '928022089',
        nome: 'Nome 1',
        morada: 'Rua X',
        documento: 'CC 123',
        dataNascimento: new Date('1990-01-02T00:00:00Z'),
        fichaSpo: 'SPO-1',
        temFoto: true,
      },
    ],
    validacoes: [
      { numero: 1, data: validacoes[0], feita: true, renovacoes: [] },
      { numero: 2, data: validacoes[1], feita: true, renovacoes: [] },
      { numero: 3, data: validacoes[2], feita: false, renovacoes: ['145779040'] },
    ],
    datasValidacao: validacoes,
  }
}

describe('buildIntercecoesWorkbook', () => {
  test('gera as quatro folhas do controlo em papel, pela mesma ordem', () => {
    const wb = buildIntercecoesWorkbook(sampleData())
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Alvo',
      'Registos',
      'Relações',
      'Produtos com Interesse',
    ])
  })

  test('folha Alvo: contacto e IMEI em colunas distintas, conforme o tipo', () => {
    const ws = buildIntercecoesWorkbook(sampleData()).getWorksheet('Alvo')!
    const header = ws.getRow(1).values as unknown[]
    expect(header).toContain('CÓDIGO DO ALVO')
    expect(header).toContain('DATA DO OFÍCIO')

    const sim = ws.getRow(2)
    expect(sim.getCell(2).value).toBe('145779040')
    expect(sim.getCell(3).value).toBe('912345678') // contacto
    expect(sim.getCell(4).value ?? '').toBe('') // sem IMEI
    expect(sim.getCell(6).value).toBe('05/06/2026') // data do ofício

    const imei = ws.getRow(3)
    expect(imei.getCell(3).value ?? '').toBe('') // sem contacto
    expect(imei.getCell(4).value).toBe('350000000000000')
    expect(imei.getCell(6).value ?? '').toBe('') // sem ofício
  })

  test('folha Alvo: alvo sem linhas continua a gerar um registo', () => {
    const ws = buildIntercecoesWorkbook(sampleData()).getWorksheet('Alvo')!
    // Cabeçalho + 2 linhas do "Nome 1" + 1 registo do "Nome 2".
    expect(ws.rowCount).toBe(4)
    expect(ws.getRow(4).getCell(1).value).toBe('Nome 2')
    expect(ws.getRow(4).getCell(2).value ?? '').toBe('')
  })

  test('folha Registos: "ouvido até" por linha e validações com o ✓ de feito', () => {
    const ws = buildIntercecoesWorkbook(sampleData()).getWorksheet('Registos')!
    expect(ws.getRow(1).getCell(1).value).toBe('OUVIDO ATÉ')
    expect(ws.getRow(2).getCell(3).value).toBe('PRODUTO')

    // Linha com registo de "ouvido até".
    expect(ws.getRow(3).getCell(2).value).toBe('145779040')
    expect(ws.getRow(3).getCell(3).value).toBe('70623')
    expect(ws.getRow(3).getCell(4).value).toBe('27/08/2026')
    // Linha sem registo fica em branco, mas aparece na mesma.
    expect(ws.getRow(4).getCell(2).value).toBe('146093080')
    expect(ws.getRow(4).getCell(3).value ?? '').toBe('')

    const linhas: unknown[][] = []
    ws.eachRow((r) => linhas.push([r.getCell(1).value, r.getCell(2).value, r.getCell(3).value]))
    expect(linhas.some((l) => l[0] === 'VALIDAÇÕES/RENOVAÇÕES')).toBe(true)
    expect(linhas.some((l) => l[0] === '1.ª Validação' && l[2] === '✓')).toBe(true)
    // A validação que serve de renovação di-lo no próprio nome.
    expect(
      linhas.some((l) => l[0] === '3.ª Validação/Renovação do Alvo 145779040' && (l[2] ?? '') === ''),
    ).toBe(true)
  })

  test('folha Relações: uma linha por contacto fichado', () => {
    const ws = buildIntercecoesWorkbook(sampleData()).getWorksheet('Relações')!
    expect(ws.getRow(1).getCell(4).value).toBe('DOC. DE IDENTIFICAÇÃO')
    const row = ws.getRow(2)
    expect(row.getCell(1).value).toBe('928022089')
    expect(row.getCell(5).value).toBe('02/01/1990')
    expect(row.getCell(7).value).toBe('Sim') // tem foto
    expect(ws.rowCount).toBe(2)
  })

  test('folha Produtos: separadores de lote pela data, como no ficheiro em papel', () => {
    const ws = buildIntercecoesWorkbook(sampleData()).getWorksheet('Produtos com Interesse')!
    const primeiraColuna: unknown[] = []
    ws.eachRow((r, n) => {
      if (n > 1) primeiraColuna.push(r.getCell(1).value)
    })
    // 3 separadores + 3 produtos, por ordem cronológica.
    expect(primeiraColuna).toEqual([
      '1.º Controlo',
      'Raw (Em Bruto)',
      '2.º Controlo',
      'Voz',
      '3.º Controlo',
      'Voz',
    ])
  })

  test('folha Produtos: ID do produto, direção e estado de transcrição', () => {
    const ws = buildIntercecoesWorkbook(sampleData()).getWorksheet('Produtos com Interesse')!
    const header = ws.getRow(1).values as unknown[]
    expect(header).toContain('ID DO PRODUTO')
    expect(header).toContain('IDENTIFICAÇÃO DO "DE"')

    // Linha 3 = 1.º produto (a 2 é o separador do 1.º Controlo).
    const raw = ws.getRow(3)
    expect(raw.getCell(6).value).toBe('870437343793137000')
    expect(raw.getCell(14).value).toBe('Autorizada')

    // Linha 5 = produto do 2.º Controlo, "De saída" e sem transcrição.
    const voz = ws.getRow(5)
    expect(voz.getCell(4).value).toBe('De saída')
    expect(voz.getCell(12).value).toBe('Empresa de Mudanças')
    expect(voz.getCell(14).value ?? '').toBe('')
  })

  test('sem plano de validações, todos os produtos ficam no 1.º Controlo', () => {
    const data = { ...sampleData(), datasValidacao: [], validacoes: [] }
    const ws = buildIntercecoesWorkbook(data).getWorksheet('Produtos com Interesse')!
    const separadores: unknown[] = []
    ws.eachRow((r, n) => {
      const v = r.getCell(1).value
      if (n > 1 && typeof v === 'string' && v.endsWith('Controlo')) separadores.push(v)
    })
    expect(separadores).toEqual(['1.º Controlo'])
  })
})

describe('anotarRenovacoes', () => {
  test('assinala a última validação antes do fim de cada linha', () => {
    // Reproduz o ficheiro real: 1.ª validação a 17/06, de 14 em 14 dias.
    const plano = { dataPrimeira: new Date('2026-06-17T00:00:00Z'), intervaloDias: 14 }
    const validacoes = Array.from({ length: 9 }, (_, i) => ({
      numero: i + 1,
      data: new Date(Date.UTC(2026, 5, 17 + i * 14)),
      feita: false,
    }))
    const anotadas = anotarRenovacoes(validacoes, plano, [
      { codigo: '145779040', dataFim: new Date('2026-09-05T00:00:00Z') },
      { codigo: '146093080', dataFim: new Date('2026-10-06T00:00:00Z') },
    ])
    expect(anotadas.find((v) => v.numero === 6)?.renovacoes).toEqual(['145779040'])
    expect(anotadas.find((v) => v.numero === 8)?.renovacoes).toEqual(['146093080'])
    expect(anotadas.filter((v) => v.renovacoes.length > 0).map((v) => v.numero)).toEqual([6, 8])
  })

  test('sem plano não há renovações assinaladas', () => {
    const anotadas = anotarRenovacoes(
      [{ numero: 1, data: new Date('2026-06-17T00:00:00Z'), feita: false }],
      null,
      [{ codigo: 'A', dataFim: new Date('2026-09-05T00:00:00Z') }],
    )
    expect(anotadas[0].renovacoes).toEqual([])
  })
})

describe('resolverIdentificacoes', () => {
  function produto(de: string | null, manual: string | null): XlsxProduto {
    return {
      tipo: 'VOZ',
      numeroProduto: null,
      idProduto: null,
      direcao: null,
      data: new Date('2026-06-17T00:00:00Z'),
      horaInicio: null,
      horaFim: null,
      duracao: null,
      transcricao: 'NENHUMA',
      de,
      identificacaoDe: manual,
      para: null,
      identificacaoPara: null,
      resumo: 'x',
      comentarios: null,
      linha: null,
    }
  }

  test('a Relação tem precedência sobre o texto manual e ignora a formatação', () => {
    const [p] = resolverIdentificacoes(
      [produto('928 022 089', 'escrito à mão')],
      [{ contacto: '928022089', nome: 'Miguel Viegas' }],
    )
    expect(p.identificacaoDe).toBe('Miguel Viegas')
  })

  test('sem Relação correspondente, fica o texto manual', () => {
    const [p] = resolverIdentificacoes(
      [produto('999999999', 'Namorada (Luz ?)')],
      [{ contacto: '928022089', nome: 'Miguel Viegas' }],
    )
    expect(p.identificacaoDe).toBe('Namorada (Luz ?)')
  })
})

describe('buildTranscricaoWorkbook', () => {
  function mkProduto(
    transcricao: XlsxProduto['transcricao'],
    resumo: string,
  ): TranscricaoData['alvos'][number]['produtos'][number] {
    return {
      tipo: 'VOZ',
      numeroProduto: null,
      idProduto: null,
      direcao: 'EFETUADA',
      data: new Date('2026-05-06T00:00:00Z'),
      horaInicio: '09:30',
      horaFim: '09:45',
      duracao: '15:00',
      transcricao,
      de: '911',
      identificacaoDe: null,
      para: '922',
      identificacaoPara: null,
      resumo,
      comentarios: null,
      linha: { identificador: '912345678', codigo: '111' },
    }
  }

  test('inclui os produtos com transcrição pedida, autorizada ou feita', () => {
    const data: TranscricaoData = {
      nuipc: '1/24',
      alvos: [
        {
          nome: 'Alvo A',
          produtos: [mkProduto('PEDIDA', 'transcrever-1'), mkProduto('NENHUMA', 'ignorar')],
        },
        { nome: 'Alvo B', produtos: [mkProduto('TRANSCRITA', 'transcrever-2')] },
      ],
    }
    const wb = buildTranscricaoWorkbook(data)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Para transcrição'])

    const ws = wb.getWorksheet('Para transcrição')!
    // Cabeçalho + 2 produtos com transcrição.
    expect(ws.rowCount).toBe(3)
    const header = ws.getRow(1).values as unknown[]
    // O estado deixa de ser implícito: a worklist distingue o que falta
    // autorizar do que falta transcrever.
    expect(header).toContain('Estado')

    const estados: unknown[] = []
    const resumos: unknown[] = []
    ws.eachRow((r, n) => {
      if (n > 1) {
        estados.push(r.getCell(1).value)
        resumos.push(r.getCell(17).value)
      }
    })
    expect(estados).toEqual(['Pedida', 'Transcrita'])
    expect(resumos).toContain('transcrever-1')
    expect(resumos).not.toContain('ignorar')
  })

  test('sem produtos com transcrição → folha só com cabeçalho', () => {
    const data: TranscricaoData = {
      nuipc: 'x',
      alvos: [{ nome: 'A', produtos: [mkProduto('NENHUMA', 'x')] }],
    }
    const ws = buildTranscricaoWorkbook(data).getWorksheet('Para transcrição')!
    expect(ws.rowCount).toBe(1)
  })
})
