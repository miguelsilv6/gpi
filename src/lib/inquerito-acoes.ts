'use client'

import { useEffect, useRef } from 'react'

/**
 * Canal entre o menu "Ações" do inquérito e os painéis/diálogos da página.
 * O menu dispara uma ação; o componente dono do formulário (painel ou
 * diálogo) ouve-a e abre-se — sem duplicar formulários nem elevar estado.
 */
export type AcaoInquerito =
  | 'colaborador'
  | 'interveniente'
  | 'relacao'
  | 'apreensao'
  | 'pericia'
  | 'tarefa'
  | 'nota'
  | 'documento'
  | 'documentacao-pendente'
  | 'reabrir'
  | 'eliminar'

const EVENTO = 'gpi:inquerito-acao'

export function dispararAcao(acao: AcaoInquerito) {
  window.dispatchEvent(new CustomEvent<AcaoInquerito>(EVENTO, { detail: acao }))
}

/** Executa `handler` sempre que `acao` é disparada (enquanto `ativo`). */
export function useAcaoInquerito(acao: AcaoInquerito, handler: () => void, ativo = true) {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })
  useEffect(() => {
    if (!ativo) return
    const onAcao = (e: Event) => {
      if ((e as CustomEvent<AcaoInquerito>).detail === acao) handlerRef.current()
    }
    window.addEventListener(EVENTO, onAcao)
    return () => window.removeEventListener(EVENTO, onAcao)
  }, [acao, ativo])
}

/** Leva o elemento para a vista (depois de o React o mostrar). */
export function mostrarElemento(el: HTMLElement | null) {
  if (!el) return
  requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
