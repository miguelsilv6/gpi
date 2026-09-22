/**
 * Exportação de interceções para Excel (.xlsx), no formato do controlo de
 * escutas mantido à mão — as mesmas quatro folhas, pela mesma ordem:
 *
 *   1. "Alvo"                  — uma linha por interceção autorizada;
 *   2. "Registos"              — "Ouvido até" por linha + Validações/Renovações;
 *   3. "Relações"              — contactos identificados;
 *   4. "Produtos com Interesse"— produtos, separados por lote de controlo.
 *
 * Manter o formato significa que o ficheiro exportado continua a servir para
 * juntar ao processo ou entregar a quem ainda trabalha em papel, sem tradução.
 *
 * `buildIntercecoesWorkbook` é puro (recebe dados simples, devolve o workbook),
 * portanto testável sem base de dados nem rota HTTP.
 */
import ExcelJS from 'exceljs'
import {
  TIPO_PRODUTO_LABEL,
  DIRECAO_LABEL,
  TRANSCRICAO_LABEL,
  numeroControlo,
  numeroValidacaoRenovacao,
  normalizarContacto,
  temTranscricao,
} from '@/lib/validations/intercecao'
import type {
  TipoLinhaIntercecao,
  TipoProdutoIntercecao,
  DirecaoProdutoIntercecao,
  EstadoTranscricao,
} from '@/generated/prisma/enums'

export interface XlsxOuvidoAte {
  numeroProduto: string | null
  data: Date
  horaInicio: string | null
  horaFim: string | null
}

export interface XlsxLinha {
  codigo: string
  tipo: TipoLinhaIntercecao
  identificador: string
  rede: string | null
  dataOficio: Date | null
  dataInicio: Date
  dataFim: Date
  renovacoes: number
  observacoes: string | null
  /** Registo de "ouvido até" mais recente desta linha, se existir. */
  ouvidoAte: XlsxOuvidoAte | null
}

export interface XlsxProduto {
  tipo: TipoProdutoIntercecao
  numeroProduto: string | null
  idProduto: string | null
  direcao: DirecaoProdutoIntercecao | null
  data: Date
  horaInicio: string | null
  horaFim: string | null
  duracao: string | null
  transcricao: EstadoTranscricao
  de: string | null
  identificacaoDe: string | null
  para: string | null
  identificacaoPara: string | null
  resumo: string
  comentarios: string | null
  linha: { identificador: string; codigo: string } | null
}

export interface XlsxAlvo {
  nome: string
  observacoes: string | null
  notas: string | null
  linhas: XlsxLinha[]
  produtos: XlsxProduto[]
}

export interface XlsxRelacao {
  contacto: string
  nome: string | null
  morada: string | null
  documento: string | null
  dataNascimento: Date | null
  fichaSpo: string | null
  temFoto: boolean
}

export interface XlsxValidacao {
  numero: number
  data: Date
  feita: boolean
  /** Alvos/linhas cuja renovação se prepara nesta validação. */
  renovacoes: string[]
}

export interface XlsxData {
  nuipc: string
  alvos: XlsxAlvo[]
  relacoes: XlsxRelacao[]
  validacoes: XlsxValidacao[]
  /** Datas das validações, para separar os produtos por lote de controlo. */
  datasValidacao: Date[]
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E3A5F' },
}

// Fundo das linhas separadoras "N.º Controlo" na folha de produtos.
const CONTROLO_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8EEF6' },
}

/** Data em UTC (as datas são guardadas à meia-noite UTC) → "dd/mm/aaaa". */
function fmtData(d: Date): string {
  return new Date(d).toLocaleDateString('pt-PT', { timeZone: 'UTC' })
}

/** Estiliza uma linha de cabeçalho: negrito, fundo escuro, texto branco. */
function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = HEADER_FILL
  row.alignment = { vertical: 'middle' }
  row.height = 20
}

/** Cabeçalho na linha 1 + congelamento (folhas com `columns` definidas). */
function styleHeader(ws: ExcelJS.Worksheet) {
  styleHeaderRow(ws.getRow(1))
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

/**
 * Número de contacto e IMEI em colunas separadas, como no ficheiro em papel:
 * uma interceção de cartão vai para "Contacto", uma de equipamento para "IMEI".
 */
function contactoEImei(l: XlsxLinha): { contacto: string; imei: string } {
  return l.tipo === 'IMEI'
    ? { contacto: '', imei: l.identificador }
    : { contacto: l.identificador, imei: '' }
}

/** Constrói o workbook de interceções a partir de dados simples (testável). */
export function buildIntercecoesWorkbook(data: XlsxData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'GPI'
  wb.created = new Date()

  construirFolhaAlvo(wb, data)
  construirFolhaRegistos(wb, data)
  construirFolhaRelacoes(wb, data)
  construirFolhaProdutos(wb, data)

  return wb
}

// ── 1. "Alvo" ────────────────────────────────────────────────────────────────

function construirFolhaAlvo(wb: ExcelJS.Workbook, data: XlsxData) {
  const ws = wb.addWorksheet('Alvo')
  ws.columns = [
    { header: 'SUSPEITO', key: 'suspeito', width: 28 },
    { header: 'CÓDIGO DO ALVO', key: 'codigo', width: 16 },
    { header: 'CONTACTO', key: 'contacto', width: 18 },
    { header: 'IMEI', key: 'imei', width: 20 },
    { header: 'OPERADORA', key: 'operadora', width: 14 },
    { header: 'DATA DO OFÍCIO', key: 'dataOficio', width: 16 },
    { header: 'DATA DE INÍCIO', key: 'dataInicio', width: 15 },
    { header: 'DATA DE FIM', key: 'dataFim', width: 14 },
    { header: 'RENOVAÇÕES', key: 'renovacoes', width: 13 },
    { header: 'OBSERVAÇÕES', key: 'observacoes', width: 34 },
  ]

  for (const alvo of data.alvos) {
    if (alvo.linhas.length === 0) {
      // Alvo ainda sem interceção autorizada: só o nome e o que dele se sabe.
      ws.addRow({ suspeito: alvo.nome, observacoes: alvo.observacoes ?? '' })
      continue
    }
    for (const l of alvo.linhas) {
      const { contacto, imei } = contactoEImei(l)
      ws.addRow({
        suspeito: alvo.nome,
        codigo: l.codigo,
        contacto,
        imei,
        operadora: l.rede ?? '',
        dataOficio: l.dataOficio ? fmtData(l.dataOficio) : '',
        dataInicio: fmtData(l.dataInicio),
        dataFim: fmtData(l.dataFim),
        renovacoes: l.renovacoes,
        observacoes: l.observacoes ?? '',
      })
    }
  }
  styleHeader(ws)
}

// ── 2. "Registos" (ouvido até + validações/renovações) ───────────────────────

function construirFolhaRegistos(wb: ExcelJS.Workbook, data: XlsxData) {
  const ws = wb.addWorksheet('Registos')
  ws.columns = [
    { key: 'a', width: 30 },
    { key: 'b', width: 18 },
    { key: 'c', width: 16 },
    { key: 'd', width: 16 },
    { key: 'e', width: 16 },
    { key: 'f', width: 16 },
  ]

  const titulo = ws.addRow(['OUVIDO ATÉ'])
  ws.mergeCells(titulo.number, 1, titulo.number, 6)
  styleHeaderRow(titulo)

  const cab = ws.addRow([
    'SUSPEITO',
    'CÓDIGO DO ALVO',
    'PRODUTO',
    'DATA',
    'HORA DE INÍCIO',
    'HORA DE FIM',
  ])
  styleHeaderRow(cab)

  for (const alvo of data.alvos) {
    for (const l of alvo.linhas) {
      const o = l.ouvidoAte
      ws.addRow([
        alvo.nome,
        l.codigo,
        o?.numeroProduto ?? '',
        o ? fmtData(o.data) : '',
        o?.horaInicio ?? '',
        o?.horaFim ?? '',
      ])
    }
  }

  ws.addRow([])

  const tituloVal = ws.addRow(['VALIDAÇÕES/RENOVAÇÕES'])
  ws.mergeCells(tituloVal.number, 1, tituloVal.number, 3)
  styleHeaderRow(tituloVal)

  const cabVal = ws.addRow(['Nº', 'DATA', 'FEITO'])
  styleHeaderRow(cabVal)

  for (const v of data.validacoes) {
    // Mesma convenção do ficheiro em papel: a validação que serve de renovação
    // di-lo no próprio nome ("6.ª Validação/Renovação do Alvo 145779040").
    const sufixo =
      v.renovacoes.length > 0 ? `/Renovação do Alvo ${v.renovacoes.join(', ')}` : ''
    const row = ws.addRow([`${v.numero}.ª Validação${sufixo}`, fmtData(v.data), v.feita ? '✓' : ''])
    if (v.renovacoes.length > 0) row.font = { bold: true }
  }

  ws.views = [{ state: 'frozen', ySplit: 2 }]
}

// ── 3. "Relações" ────────────────────────────────────────────────────────────

function construirFolhaRelacoes(wb: ExcelJS.Workbook, data: XlsxData) {
  const ws = wb.addWorksheet('Relações')
  ws.columns = [
    { header: 'CONTACTO', key: 'contacto', width: 18 },
    { header: 'NOME', key: 'nome', width: 30 },
    { header: 'MORADA', key: 'morada', width: 40 },
    { header: 'DOC. DE IDENTIFICAÇÃO', key: 'documento', width: 22 },
    { header: 'DATA DE NASCIMENTO', key: 'dataNascimento', width: 20 },
    { header: 'FICHA NO SPO', key: 'fichaSpo', width: 16 },
    { header: 'FOTO', key: 'foto', width: 10 },
  ]
  for (const r of data.relacoes) {
    ws.addRow({
      contacto: r.contacto,
      nome: r.nome ?? '',
      morada: r.morada ?? '',
      documento: r.documento ?? '',
      dataNascimento: r.dataNascimento ? fmtData(r.dataNascimento) : '',
      fichaSpo: r.fichaSpo ?? '',
      // A imagem não viaja no .xlsx; fica a indicação de que existe no GPI.
      foto: r.temFoto ? 'Sim' : '',
    })
  }
  styleHeader(ws)
}

// ── 4. "Produtos com Interesse" ──────────────────────────────────────────────

const PRODUTO_COLUNAS = 14

function construirFolhaProdutos(wb: ExcelJS.Workbook, data: XlsxData) {
  const ws = wb.addWorksheet('Produtos com Interesse')
  ws.columns = [
    { header: 'TIPO DE PRODUTO', key: 'tipo', width: 18 },
    { header: 'SUSPEITO', key: 'suspeito', width: 24 },
    { header: 'ALVO', key: 'alvo', width: 16 },
    { header: 'DIREÇÃO', key: 'direcao', width: 13 },
    { header: 'PRODUTO', key: 'produto', width: 12 },
    { header: 'ID DO PRODUTO', key: 'idProduto', width: 22 },
    { header: 'DATA', key: 'data', width: 13 },
    { header: 'HORA DE INÍCIO', key: 'horaInicio', width: 15 },
    { header: 'DE', key: 'de', width: 16 },
    { header: 'IDENTIFICAÇÃO DO "DE"', key: 'identDe', width: 28 },
    { header: 'PARA', key: 'para', width: 16 },
    { header: 'IDENTIFICAÇÃO DO "PARA"', key: 'identPara', width: 28 },
    { header: 'DESCRIÇÃO', key: 'descricao', width: 50 },
    { header: 'TRANSCRIÇÃO', key: 'transcricao', width: 14 },
  ]

  // Todos os produtos do inquérito por ordem cronológica, como no ficheiro em
  // papel — é a ordem que permite ler a investigação de seguida e é o que dá
  // sentido aos separadores de controlo.
  const todos = data.alvos
    .flatMap((a) => a.produtos.map((p) => ({ ...p, suspeito: a.nome })))
    .sort((x, y) => x.data.getTime() - y.data.getTime() || (x.horaInicio ?? '').localeCompare(y.horaInicio ?? ''))

  let controloAtual = 0
  for (const p of todos) {
    const controlo = numeroControlo(p.data, data.datasValidacao)
    if (controlo !== controloAtual) {
      controloAtual = controlo
      const sep = ws.addRow([`${controlo}.º Controlo`])
      ws.mergeCells(sep.number, 1, sep.number, PRODUTO_COLUNAS)
      sep.font = { bold: true, color: { argb: 'FF1E3A5F' } }
      sep.fill = CONTROLO_FILL
    }

    const row = ws.addRow({
      tipo: TIPO_PRODUTO_LABEL[p.tipo] ?? p.tipo,
      suspeito: p.suspeito,
      alvo: p.linha?.codigo ?? '',
      direcao: p.direcao ? DIRECAO_LABEL[p.direcao] : '',
      produto: p.numeroProduto ?? '',
      idProduto: p.idProduto ?? '',
      data: fmtData(p.data),
      horaInicio: p.horaInicio ?? '',
      de: p.de ?? '',
      identDe: p.identificacaoDe ?? '',
      para: p.para ?? '',
      identPara: p.identificacaoPara ?? '',
      descricao: p.resumo,
      transcricao: temTranscricao(p.transcricao) ? TRANSCRICAO_LABEL[p.transcricao] : '',
    })
    row.getCell('descricao').alignment = { wrapText: true, vertical: 'top' }
    if (temTranscricao(p.transcricao)) {
      row.getCell('transcricao').font = { bold: true, color: { argb: 'FF9A3412' } }
    }
  }

  styleHeader(ws)
}

// ── Relatório de transcrições ────────────────────────────────────────────────

export interface TranscricaoData {
  nuipc: string
  alvos: Array<{ nome: string; produtos: XlsxProduto[] }>
}

/**
 * Worklist do transcritor: uma folha plana com os produtos cujo estado de
 * transcrição não é NENHUMA (pedida, autorizada ou já transcrita), para que se
 * veja de relance o que falta autorizar e o que falta transcrever.
 * Puro/testável.
 */
export function buildTranscricaoWorkbook(data: TranscricaoData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'GPI'
  wb.created = new Date()

  const ws = wb.addWorksheet('Para transcrição')
  ws.columns = [
    { header: 'Estado', key: 'estado', width: 14 },
    { header: 'Suspeito', key: 'alvo', width: 26 },
    { header: 'Código', key: 'codigo', width: 12 },
    { header: 'Linha', key: 'linha', width: 20 },
    { header: 'Tipo de Produto', key: 'tipo', width: 16 },
    { header: 'Nº Produto', key: 'numeroProduto', width: 14 },
    { header: 'ID do Produto', key: 'idProduto', width: 22 },
    { header: 'Direção', key: 'direcao', width: 12 },
    { header: 'Data', key: 'data', width: 14 },
    { header: 'Hora Início', key: 'horaInicio', width: 12 },
    { header: 'Hora Fim', key: 'horaFim', width: 12 },
    { header: 'Duração', key: 'duracao', width: 12 },
    { header: 'De', key: 'de', width: 16 },
    { header: 'Identificação do "De"', key: 'identDe', width: 26 },
    { header: 'Para', key: 'para', width: 16 },
    { header: 'Identificação do "Para"', key: 'identPara', width: 26 },
    { header: 'Descrição/Resumo', key: 'resumo', width: 60 },
    { header: 'Comentários', key: 'comentarios', width: 34 },
  ]
  for (const alvo of data.alvos) {
    for (const p of alvo.produtos) {
      if (!temTranscricao(p.transcricao)) continue
      const row = ws.addRow({
        estado: TRANSCRICAO_LABEL[p.transcricao],
        alvo: alvo.nome,
        codigo: p.linha?.codigo ?? '',
        linha: p.linha?.identificador ?? '',
        tipo: TIPO_PRODUTO_LABEL[p.tipo] ?? p.tipo,
        numeroProduto: p.numeroProduto ?? '',
        idProduto: p.idProduto ?? '',
        direcao: p.direcao ? DIRECAO_LABEL[p.direcao] : '',
        data: fmtData(p.data),
        horaInicio: p.horaInicio ?? '',
        horaFim: p.horaFim ?? '',
        duracao: p.duracao ?? '',
        de: p.de ?? '',
        identDe: p.identificacaoDe ?? '',
        para: p.para ?? '',
        identPara: p.identificacaoPara ?? '',
        resumo: p.resumo,
        comentarios: p.comentarios ?? '',
      })
      row.getCell('resumo').alignment = { wrapText: true, vertical: 'top' }
      row.getCell('comentarios').alignment = { wrapText: true, vertical: 'top' }
    }
  }
  styleHeader(ws)
  return wb
}

// ── Montagem dos dados da folha "Registos" (puro) ────────────────────────────

/**
 * Anota cada validação com as linhas cuja renovação se prepara nela, usando a
 * mesma regra do motor de alertas (`numeroValidacaoRenovacao`), para que o
 * ficheiro exportado e as notificações nunca discordem.
 */
export function anotarRenovacoes(
  validacoes: ReadonlyArray<{ numero: number; data: Date; feita: boolean }>,
  plano: { dataPrimeira: Date; intervaloDias: number } | null,
  linhas: ReadonlyArray<{ codigo: string; dataFim: Date }>,
): XlsxValidacao[] {
  return validacoes.map((v) => ({
    ...v,
    renovacoes: plano
      ? linhas
          .filter(
            (l) => numeroValidacaoRenovacao(plano.dataPrimeira, plano.intervaloDias, l.dataFim) === v.numero,
          )
          .map((l) => l.codigo)
      : [],
  }))
}

/**
 * Preenche `identificacaoDe`/`identificacaoPara` a partir das Relações antes de
 * exportar — no ficheiro final o inspetor quer os nomes já resolvidos, não os
 * números por identificar. A Relação tem precedência sobre o texto manual.
 */
export function resolverIdentificacoes(
  produtos: readonly XlsxProduto[],
  relacoes: ReadonlyArray<{ contacto: string; nome: string | null }>,
): XlsxProduto[] {
  const index = new Map(relacoes.map((r) => [normalizarContacto(r.contacto), r.nome]))
  const resolve = (numero: string | null, manual: string | null): string | null => {
    if (numero) {
      const nome = index.get(normalizarContacto(numero))
      if (nome) return nome
    }
    return manual
  }
  return produtos.map((p) => ({
    ...p,
    identificacaoDe: resolve(p.de, p.identificacaoDe),
    identificacaoPara: resolve(p.para, p.identificacaoPara),
  }))
}
