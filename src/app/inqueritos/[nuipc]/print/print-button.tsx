'use client'

import { useEffect } from 'react'

interface Props {
  /** Trigger the browser print dialog as soon as the page loads. */
  auto?: boolean
}

export function PrintButton({ auto = false }: Props) {
  useEffect(() => {
    if (!auto) return
    // Give the browser a tick to lay out the page before launching the dialog.
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [auto])

  return (
    <button type="button" onClick={() => window.print()}>
      Imprimir / Guardar PDF
    </button>
  )
}
