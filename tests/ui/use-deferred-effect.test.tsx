// @vitest-environment jsdom
/**
 * useDeferredEffect: o corpo corre assincronamente (nunca dentro do efeito),
 * respeita as dependências, cancela se desmontar antes e executa a limpeza.
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useState } from 'react'
import { useDeferredEffect } from '@/hooks/use-deferred-effect'

afterEach(() => cleanup())

const flush = () => act(async () => { await Promise.resolve() })

function Probe({ dep, effect }: { dep: number; effect: () => void | (() => void) }) {
  useDeferredEffect(() => effect(), [dep, effect])
  return null
}

describe('useDeferredEffect', () => {
  test('não corre sincronamente no efeito; corre logo a seguir (microtarefa)', async () => {
    const effect = vi.fn()
    render(<Probe dep={1} effect={effect} />)
    expect(effect).not.toHaveBeenCalled()
    await flush()
    expect(effect).toHaveBeenCalledTimes(1)
  })

  test('volta a correr quando uma dependência muda e não quando não muda', async () => {
    const effect = vi.fn()
    const { rerender } = render(<Probe dep={1} effect={effect} />)
    await flush()
    rerender(<Probe dep={1} effect={effect} />)
    await flush()
    expect(effect).toHaveBeenCalledTimes(1)
    rerender(<Probe dep={2} effect={effect} />)
    await flush()
    expect(effect).toHaveBeenCalledTimes(2)
  })

  test('se desmontar antes da microtarefa, o corpo não corre', async () => {
    const effect = vi.fn()
    const { unmount } = render(<Probe dep={1} effect={effect} />)
    unmount()
    await flush()
    expect(effect).not.toHaveBeenCalled()
  })

  test('executa a limpeza devolvida ao desmontar e ao mudar de dependência', async () => {
    const cleanupFn = vi.fn()
    const effect = vi.fn(() => cleanupFn)
    const { rerender, unmount } = render(<Probe dep={1} effect={effect} />)
    await flush()
    rerender(<Probe dep={2} effect={effect} />)
    await flush()
    expect(cleanupFn).toHaveBeenCalledTimes(1)
    unmount()
    expect(cleanupFn).toHaveBeenCalledTimes(2)
  })

  test('permite atualizar estado a partir do corpo (carregamento de dados)', async () => {
    function Loader() {
      const [value, setValue] = useState('a carregar')
      useDeferredEffect(() => { setValue('carregado') }, [])
      return <p>{value}</p>
    }
    const { getByText } = render(<Loader />)
    expect(getByText('a carregar')).toBeTruthy()
    await flush()
    expect(getByText('carregado')).toBeTruthy()
  })
})
