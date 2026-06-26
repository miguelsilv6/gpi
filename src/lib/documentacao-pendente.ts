/**
 * Regras de "documentação pendente" de um inquérito.
 *
 * Um inquérito pode ser marcado como tendo documentação por juntar (ex.: já foi
 * enviado/concluído mas chegou documentação que tem de ser anexada a
 * posterior). Centralizamos aqui o cálculo dos três campos para que a edição
 * completa do inquérito e o endpoint dedicado de toggle se comportem de igual
 * forma — em especial a regra do `documentacaoPendenteDesde`:
 *
 *  - preenchido apenas na transição para "pendente" (mantém-se se já estava);
 *  - limpo (com a nota) quando deixa de estar pendente.
 */

export interface DocumentacaoPendenteState {
  documentacaoPendente: boolean
  documentacaoPendenteDesde: Date | null
}

export interface DocumentacaoPendenteUpdate {
  documentacaoPendente: boolean
  documentacaoPendenteNota: string | null
  documentacaoPendenteDesde: Date | null
}

export function computeDocumentacaoPendenteUpdate(args: {
  pendente: boolean
  nota?: string | null
  current: DocumentacaoPendenteState
  now?: Date
}): DocumentacaoPendenteUpdate {
  const { pendente, current } = args
  const now = args.now ?? new Date()

  if (!pendente) {
    return {
      documentacaoPendente: false,
      documentacaoPendenteNota: null,
      documentacaoPendenteDesde: null,
    }
  }

  const nota = args.nota?.trim() ? args.nota.trim() : null
  // Preserva o "desde" original se já estava pendente; caso contrário marca
  // o momento atual.
  const desde =
    current.documentacaoPendente && current.documentacaoPendenteDesde
      ? current.documentacaoPendenteDesde
      : now

  return {
    documentacaoPendente: true,
    documentacaoPendenteNota: nota,
    documentacaoPendenteDesde: desde,
  }
}
