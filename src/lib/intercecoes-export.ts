/**
 * Carregamento dos dados das exportações de interceções — a ponte entre a BD e
 * os construtores puros de `intercecoes-xlsx.ts`.
 *
 * Fica num módulo próprio porque as duas rotas de exportação (controlo completo
 * e worklist de transcrições) precisam do mesmo `select`, e porque é aqui que
 * as identificações de "DE"/"PARA" são resolvidas pelas Relações antes de
 * chegarem ao ficheiro.
 */
import { prisma } from '@/lib/prisma'
import {
  anotarRenovacoes,
  resolverIdentificacoes,
  type XlsxData,
  type XlsxProduto,
  type TranscricaoData,
} from '@/lib/intercecoes-xlsx'

const PRODUTO_SELECT = {
  tipo: true,
  numeroProduto: true,
  idProduto: true,
  direcao: true,
  data: true,
  horaInicio: true,
  horaFim: true,
  duracao: true,
  transcricao: true,
  de: true,
  identificacaoDe: true,
  para: true,
  identificacaoPara: true,
  resumo: true,
  comentarios: true,
  linha: { select: { identificador: true, codigo: true } },
} as const

/** Dados completos do controlo de escutas de um inquérito, prontos a exportar. */
export async function getDadosExportacao(
  inqueritoId: string,
  nuipc: string,
): Promise<XlsxData> {
  const [alvosRaw, relacoes, plano] = await Promise.all([
    prisma.intercecaoAlvo.findMany({
      where: { inqueritoid: inqueritoId },
      orderBy: { nome: 'asc' },
      select: {
        nome: true,
        observacoes: true,
        notas: true,
        linhas: {
          orderBy: { dataInicio: 'asc' },
          select: {
            codigo: true,
            tipo: true,
            identificador: true,
            rede: true,
            dataOficio: true,
            dataInicio: true,
            dataFim: true,
            renovacoes: true,
            observacoes: true,
            ouvidoAte: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { numeroProduto: true, data: true, horaInicio: true, horaFim: true },
            },
          },
        },
        produtos: { orderBy: { data: 'asc' }, select: PRODUTO_SELECT },
      },
    }),
    prisma.intercecaoRelacao.findMany({
      where: { inqueritoid: inqueritoId },
      orderBy: [{ nome: 'asc' }, { contacto: 'asc' }],
      select: {
        contacto: true,
        nome: true,
        morada: true,
        documento: true,
        dataNascimento: true,
        fichaSpo: true,
        fotoStoredName: true,
      },
    }),
    prisma.intercecaoPlanoValidacao.findUnique({
      where: { inqueritoid: inqueritoId },
      select: {
        dataPrimeira: true,
        intervaloDias: true,
        validacoes: {
          orderBy: { numero: 'asc' },
          select: { numero: true, data: true, feitaEm: true },
        },
      },
    }),
  ])

  const alvos = alvosRaw.map((a) => ({
    nome: a.nome,
    observacoes: a.observacoes,
    notas: a.notas,
    linhas: a.linhas.map((l) => ({ ...l, ouvidoAte: l.ouvidoAte[0] ?? null })),
    produtos: resolverIdentificacoes(a.produtos, relacoes),
  }))

  const linhas = alvos.flatMap((a) => a.linhas.map((l) => ({ codigo: l.codigo, dataFim: l.dataFim })))

  return {
    nuipc,
    alvos,
    relacoes: relacoes.map((r) => ({
      contacto: r.contacto,
      nome: r.nome,
      morada: r.morada,
      documento: r.documento,
      dataNascimento: r.dataNascimento,
      fichaSpo: r.fichaSpo,
      temFoto: r.fotoStoredName !== null,
    })),
    validacoes: anotarRenovacoes(
      (plano?.validacoes ?? []).map((v) => ({
        numero: v.numero,
        data: v.data,
        feita: v.feitaEm !== null,
      })),
      plano,
      linhas,
    ),
    // As validações já geradas são a única fonte da numeração dos controlos —
    // a mesma lista que a UI usa. Sem plano não há lotes: tudo fica no 1.º.
    datasValidacao: (plano?.validacoes ?? []).map((v) => v.data),
  }
}

/** Produtos com transcrição pedida/autorizada/feita, agrupados por alvo. */
export async function getDadosTranscricao(
  inqueritoId: string,
  nuipc: string,
): Promise<{ data: TranscricaoData; total: number }> {
  const [alvos, relacoes] = await Promise.all([
    prisma.intercecaoAlvo.findMany({
      where: {
        inqueritoid: inqueritoId,
        produtos: { some: { transcricao: { not: 'NENHUMA' } } },
      },
      orderBy: { nome: 'asc' },
      select: {
        nome: true,
        produtos: {
          where: { transcricao: { not: 'NENHUMA' } },
          orderBy: { data: 'asc' },
          select: PRODUTO_SELECT,
        },
      },
    }),
    prisma.intercecaoRelacao.findMany({
      where: { inqueritoid: inqueritoId },
      select: { contacto: true, nome: true },
    }),
  ])

  const comIdentificacoes = alvos.map((a) => ({
    nome: a.nome,
    produtos: resolverIdentificacoes(a.produtos as XlsxProduto[], relacoes),
  }))

  return {
    data: { nuipc, alvos: comIdentificacoes },
    total: comIdentificacoes.reduce((n, a) => n + a.produtos.length, 0),
  }
}
