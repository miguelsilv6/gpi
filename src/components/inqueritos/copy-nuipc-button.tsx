'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopyNuipcButton({ nuipc }: { nuipc: string }) {
  const [copied, setCopied] = useState(false)

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(nuipc)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available — silent no-op
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group flex items-center gap-1.5 text-2xl font-bold font-mono tracking-tight hover:text-blue-600 transition-colors cursor-pointer"
      title="Clique para copiar o número do inquérito"
      aria-label="Copiar número do inquérito"
    >
      {nuipc}
      {copied ? (
        <Check className="h-4 w-4 text-green-500 shrink-0" />
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  )
}
