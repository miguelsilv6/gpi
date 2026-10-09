import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * Valor que só existe no cliente (ex.: capacidades do browser), sem o padrão
 * `useEffect(() => setX(...), [])`. No servidor e na hidratação devolve
 * `serverValue`; depois da hidratação passa a `getClientValue()`.
 */
export function useClientValue<T>(getClientValue: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribe, getClientValue, () => serverValue)
}

/** `false` no servidor/hidratação e `true` já no cliente (guarda de hidratação). */
export function useMounted(): boolean {
  return useClientValue(() => true, false)
}
