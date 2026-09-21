'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Check, BookOpenCheck } from 'lucide-react'

/** Indica a fonte consultada — obrigatório em todas as ferramentas OSINT. */
export function FonteNote({ fonte }: { fonte: string }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-2 border-t mt-2">
      <BookOpenCheck className="h-3 w-3 shrink-0" />
      <span>Fonte: {fonte}</span>
    </p>
  )
}

/** Linha label→valor monoespaçado usada nos resultados das ferramentas. */
export function ResultRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 py-1.5 border-b last:border-0">
      <span className="text-xs font-medium text-muted-foreground sm:w-40 shrink-0">{label}</span>
      <span className="text-sm font-mono break-all">{value ?? '—'}</span>
    </div>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 w-6 p-0 shrink-0"
      title="Copiar"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // clipboard indisponível (http sem TLS) — ignorar
        }
      }}
    >
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
    </Button>
  )
}

/** POST JSON com tratamento de erro uniforme; devolve null em falha. */
export async function postTool<T>(
  url: string,
  payload: unknown,
  onError: (msg: string) => void,
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      onError(err.error ?? `Erro ${res.status}`)
      return null
    }
    return (await res.json()) as T
  } catch {
    onError('Erro de rede')
    return null
  }
}

/**
 * POST JSON e descarrega a resposta binária como ficheiro (export
 * CSV/Markdown/PDF). Devolve `true` em sucesso, `false` em falha.
 */
export async function postToolFile(
  url: string,
  payload: unknown,
  filename: string,
  onError: (msg: string) => void,
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      onError(err.error ?? `Erro ${res.status}`)
      return false
    }
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(blobUrl)
    return true
  } catch {
    onError('Erro de rede')
    return false
  }
}
