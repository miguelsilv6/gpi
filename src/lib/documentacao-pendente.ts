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
  // Preserva o "desde" e o autor originais se já estava pendente; caso
  // contrário marca o momento atual e o utilizador atual como dono.
  const jaPendente = current.documentacaoPendente
  const desde = jaPendente && current.documentacaoPendenteDesde ? current.documentacaoPendenteDesde : now
  const porId = jaPendente && current.documentacaoPendentePorId ? current.documentacaoPendentePorId : userId

  return {
    documentacaoPendente: true,
    documentacaoPendenteNota: nota,
    documentacaoPendenteDesde: desde,
    documentacaoPendentePorId: porId,
  }
}
