/**
 * Regras de "documentação pendente" de um inquérito.
 *
 * Um inquérito pode ser marcado como tendo documentação por juntar (ex.: já foi
 * enviado/concluído mas chegou documentação que tem de ser anexada a
 * posterior). A marca é **privada do autor**: só quem a ativou a vê na
 * listagem e no detalhe.
 *
 * Centralizamos aqui o cálculo dos campos para que a edição completa do
 * inquérito e o endpoint dedicado se comportem de igual forma — em especial:
 *  - `documentacaoPendenteDesde` e `documentacaoPendentePorId` são definidos
 *    apenas na transição para "pendente" e preservados enquanto se mantém;
 *  - tudo é limpo (nota, desde, autor) quando deixa de estar pendente.
 */

export interface DocumentacaoPendenteState {
  documentacaoPendente: boolean
  documentacaoPendenteDesde: Date | null
  documentacaoPendentePorId: string | null
}

export interface DocumentacaoPendenteUpdate {
  documentacaoPendente: boolean
  documentacaoPendenteNota: string | null
  documentacaoPendenteDesde: Date | null
  documentacaoPendentePorId: string | null
}

export function computeDocumentacaoPendenteUpdate(args: {
  pendente: boolean
  nota?: string | null
  /** Utilizador que está a efetuar a marcação (passa a ser o dono da entrada). */
  userId: string
  current: DocumentacaoPendenteState
  now?: Date
}): DocumentacaoPendenteUpdate {
  const { pendente, userId, current } = args
  const now = args.now ?? new Date()

  if (!pendente) {
    return {
      documentacaoPendente: false,
      documentacaoPendenteNota: null,
      documentacaoPendenteDesde: null,
      documentacaoPendentePorId: null,
    }
  }

  const nota = args.nota?.trim() ? args.nota.trim() : null
  // "Já pendente" só conta se a marca pertence ao MESMO utilizador — assim,
  // editar a própria nota preserva o desde/autor, mas um utilizador diferente
  // a marcar assume a propriedade (não fica preso à marca de outrem nem lhe
  // sobrescreve a nota silenciosamente).
  const jaPendente =
    current.documentacaoPendente && current.documentacaoPendentePorId === userId
  const desde = jaPendente && current.documentacaoPendenteDesde ? current.documentacaoPendenteDesde : now
  const porId = jaPendente && current.documentacaoPendentePorId ? current.documentacaoPendentePorId : userId

  return {
    documentacaoPendente: true,
    documentacaoPendenteNota: nota,
    documentacaoPendenteDesde: desde,
    documentacaoPendentePorId: porId,
  }
}

/** Estado em que um inquérito deixa de aguardar documentação. */
export const ESTADO_ARQUIVADO = 'ARQUIVADO'

/**
 * Campos a limpar quando um inquérito passa a arquivado: deixa de haver
 * documentação por juntar, por isso a marca (e nota/desde/autor) é removida
 * em vez de ficar latente e reaparecer se o inquérito for reaberto.
 */
export const DOCUMENTACAO_PENDENTE_LIMPA = {
  documentacaoPendente: false,
  documentacaoPendenteNota: null,
  documentacaoPendenteDesde: null,
  documentacaoPendentePorId: null,
} as const

export function limpaDocumentacaoSeArquivado(estadoCodigo: string | null | undefined) {
  return estadoCodigo === ESTADO_ARQUIVADO ? DOCUMENTACAO_PENDENTE_LIMPA : {}
}
