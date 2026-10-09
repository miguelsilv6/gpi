import { useEffect, type DependencyList } from 'react'

/**
 * `useEffect` cujo corpo corre de forma ASSÍNCRONA (microtarefa), nunca
 * sincronamente dentro do efeito.
 *
 * Serve para efeitos que carregam dados / ressincronizam estado: o `setState`
 * deixa de acontecer a meio do commit (o que provoca renders em cascata e é o
 * que a regra `react-hooks/set-state-in-effect` pretende evitar). O resultado é
 * o mesmo que um `useEffect` normal — corre depois do render — com cancelamento
 * correto: se as dependências mudarem (ou o componente desmontar) antes da
 * microtarefa, o corpo não chega a correr; e a limpeza devolvida é respeitada.
 *
 * As dependências são verificadas pela regra `react-hooks/exhaustive-deps`
 * (ver `additionalHooks` em eslint.config.mjs).
 */
export function useDeferredEffect(effect: () => void | (() => void), deps: DependencyList) {
  useEffect(() => {
    let cancelled = false
    let cleanup: void | (() => void)
    void Promise.resolve().then(() => {
      if (!cancelled) cleanup = effect()
    })
    return () => {
      cancelled = true
      if (typeof cleanup === 'function') cleanup()
    }
    // As dependências vêm do chamador (verificadas via additionalHooks).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
