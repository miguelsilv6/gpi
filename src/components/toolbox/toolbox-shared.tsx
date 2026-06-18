'use client'

import { createContext, useContext, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Copy, Check, BookOpenCheck, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

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

/** Ativação das explicações por IA — fornecido pelo ToolboxView a partir da config. */
export const ToolboxIaContext = createContext(false)

interface ExplicacaoIa {
  explicacao: string
  modelo: string
  fonte: string
}

/**
 * Botão "Explicar (IA)" + caixa de explicação. Envia o resultado da
 * ferramenta ao LLM local e mostra a leitura em linguagem acessível.
 * Não renderiza nada quando as explicações por IA estão desativadas.
 */
export function ExplainButton({ ferramenta, resultado }: { ferramenta: string; resultado: unknown }) {
  const iaAtiva = useContext(ToolboxIaContext)
  const [loading, setLoading] = useState(false)
  const [resposta, setResposta] = useState<ExplicacaoIa | null>(null)

  if (!iaAtiva) return null

  async function run() {
    setLoading(true)
    setResposta(null)
    const data = await postTool<ExplicacaoIa>('/api/toolbox/explicar', { ferramenta, resultado }, toast.error)
    if (data) setResposta(data)
    setLoading(false)
  }

  return (
    <div className="pt-2 space-y-2">
      <Button onClick={run} disabled={loading} size="sm" variant="outline" className="gap-1.5">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {loading ? 'A analisar (pode demorar até 1 min)…' : 'Explicar (IA)'}
      </Button>
      {resposta && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-900/20 p-3 space-y-2">
          <p className="text-sm whitespace-pre-wrap">{resposta.explicacao}</p>
          <p className="text-[11px] text-violet-700 dark:text-violet-300 font-medium">
            ⚠ Gerado por IA local — verifique a informação antes de a usar em relatórios ou peças do inquérito.
          </p>
          <FonteNote fonte={resposta.fonte} />
        </div>
      )}
    </div>
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
