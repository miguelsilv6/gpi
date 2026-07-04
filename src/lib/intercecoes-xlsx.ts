/**
 * Exportação de interceções para Excel (.xlsx), fiel ao modelo de controlo de
 * escutas usado em papel: uma folha **"Alvos"** (um registo por linha SIM/IMEI)
 * e uma folha **por código de alvo** com os produtos de interesse. Acrescenta
 * as colunas da v2 — Notas (por alvo), Renovações (por linha), Duração e
 * Transcrição (por produto).
 *
 * `buildIntercecoesWorkbook` é puro (recebe dados simples, devolve o workbook),
 * portanto testável sem base de dados nem rota HTTP.
 */
import ExcelJS from 'exceljs'
import {
  TIPO_LINHA_LABEL,
  TIPO_PRODUTO_LABEL,
  DIRECAO_LABEL,
} from '@/lib/validations/intercecao'
import type {
  TipoLinhaIntercecao,
  TipoProdutoIntercecao,
  DirecaoProdutoIntercecao,
} from '@/generated/prisma/enums'

export interface XlsxLinha {
  tipo: TipoLinhaIntercecao
  identificador: string
  rede: string | null
  dataInicio: Date
  dataFim: Date
  renovacoes: number
  observacoes: string | null
}

export interface XlsxProduto {
  tipo: TipoProdutoIntercecao
  numeroProduto: string | null
  direcao: DirecaoProdutoIntercecao | null
  data: Date
  horaInicio: string | null
  horaFim: string | null
  duracao: string | null
  paraTranscricao: boolean
  de: string | null
  para: string | null
  resumo: string
  comentarios: string | null
  linha: { identificador: string } | null
}

export interface XlsxAlvo {
  nome: string
  codigo: string
  observacoes: string | null
  notas: string | null
  linhas: XlsxLinha[]
  produtos: XlsxProduto[]
}

export interface XlsxData {
  nuipc: string
  alvos: XlsxAlvo[]
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E3A5F' },
}

/** Data em UTC (as datas são guardadas à meia-noite UTC) → "dd/mm/aaaa". */
function fmtData(d: Date): string {
  return new Date(d).toLocaleDateString('pt-PT', { timeZone: 'UTC' })
}

/** Estiliza a linha de cabeçalho: negrito, fundo escuro, texto branco, congelada. */
function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = HEADER_FILL
  header.alignment = { vertical: 'middle' }
  header.height = 20
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

/**
 * Nome de folha válido para Excel: sem os caracteres proibidos (: \ / ? * [ ]),
 * ≤ 31 chars, não vazio e único no workbook (sufixo ~n em colisão).
 */
function safeSheetName(base: string, used: Set<string>): string {
  let name = (base || 'Alvo').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Alvo'
  if (used.has(name.toLowerCase())) {
    let i = 2
    let candidate: string
    do {
      const suffix = `~${i}`
      candidate = name.slice(0, 31 - suffix.length) + suffix
      i++
    } while (used.has(candidate.toLowerCase()))
    name = candidate
  }
  used.add(name.toLowerCase())
  return name
}

/** Constrói o workbook de interceções a partir de dados simples (testável). */
export function buildIntercecoesWorkbook(data: XlsxData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'GPI'
  wb.created = new Date()

  // ── Folha "Alvos" (um registo por linha) ───────────────────────────────────
  const alvosSheet = wb.addWorksheet('Alvos', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  alvosSheet.columns = [
    { header: 'Suspeito', key: 'suspeito', width: 30 },
    { header: 'Código', key: 'codigo', width: 14 },
    { header: 'Tipo', key: 'tipo', width: 12 },
    { header: 'Nº Telefone / IMEI', key: 'identificador', width: 22 },
    { header: 'Rede', key: 'rede', width: 14 },
    { header: 'Data Início', key: 'dataInicio', width: 14 },
    { header: 'Data Fim', key: 'dataFim', width: 14 },
    { header: 'Renovações', key: 'renovacoes', width: 12 },
    { header: 'Observações', key: 'observacoes', width: 30 },
    { header: 'Notas do alvo', key: 'notas', width: 30 },
  ]
  for (const alvo of data.alvos) {
    if (alvo.linhas.length === 0) {
      // Alvo sem linhas: registo só com suspeito/código e as notas do alvo.
      alvosSheet.addRow({
        suspeito: alvo.nome,
        codigo: alvo.codigo,
        observacoes: alvo.observacoes ?? '',
        notas: alvo.notas ?? '',
      })
      continue
    }
    for (const l of alvo.linhas) {
      alvosSheet.addRow({
        suspeito: alvo.nome,
        codigo: alvo.codigo,
        tipo: TIPO_LINHA_LABEL[l.tipo] ?? l.tipo,
        identificador: l.identificador,
        rede: l.rede ?? '',
        dataInicio: fmtData(l.dataInicio),
        dataFim: fmtData(l.dataFim),
        renovacoes: l.renovacoes,
        observacoes: l.observacoes ?? '',
        notas: alvo.notas ?? '',
      })
    }
  }
  styleHeader(alvosSheet)

  // ── Uma folha por código de alvo (produtos de interesse) ────────────────────
  const usedNames = new Set<string>(['alvos'])
  for (const alvo of data.alvos) {
    const ws = wb.addWorksheet(safeSheetName(alvo.codigo, usedNames))
    ws.columns = [
      { header: 'Tipo de Produto', key: 'tipo', width: 18 },
      { header: 'Nº Produto', key: 'numeroProduto', width: 14 },
      { header: 'Direção', key: 'direcao', width: 12 },
      { header: 'Alvo', key: 'alvo', width: 20 },
      { header: 'Data', key: 'data', width: 14 },
      { header: 'Hora Início', key: 'horaInicio', width: 12 },
      { header: 'Hora Fim', key: 'horaFim', width: 12 },
      { header: 'Duração', key: 'duracao', width: 12 },
      { header: 'De', key: 'de', width: 18 },
      { header: 'Para', key: 'para', width: 18 },
      { header: 'Descrição/Resumo', key: 'resumo', width: 50 },
      { header: 'Transcrição', key: 'transcricao', width: 12 },
      { header: 'Comentários', key: 'comentarios', width: 34 },
    ]
    for (const p of alvo.produtos) {
      const row = ws.addRow({
        tipo: TIPO_PRODUTO_LABEL[p.tipo] ?? p.tipo,
        numeroProduto: p.numeroProduto ?? '',
        direcao: p.direcao ? DIRECAO_LABEL[p.direcao] : '',
        alvo: p.linha?.identificador ?? '',
        data: fmtData(p.data),
        horaInicio: p.horaInicio ?? '',
        horaFim: p.horaFim ?? '',
        duracao: p.duracao ?? '',
        de: p.de ?? '',
        para: p.para ?? '',
        resumo: p.resumo,
        transcricao: p.paraTranscricao ? 'Sim' : '',
        comentarios: p.comentarios ?? '',
      })
      row.getCell('resumo').alignment = { wrapText: true, vertical: 'top' }
      row.getCell('comentarios').alignment = { wrapText: true, vertical: 'top' }
      // Realça as linhas marcadas para transcrição.
      if (p.paraTranscricao) {
        row.getCell('transcricao').font = { bold: true, color: { argb: 'FF9A3412' } }
      }
    }
    styleHeader(ws)
  }

  return wb
}
