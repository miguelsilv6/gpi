'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Tag, X, Plus, Loader2 } from 'lucide-react'

interface EtiquetaLike {
  id: string
  nome: string
}

interface EtiquetaInputProps {
  /** Ids selecionados (controlado pelo form). */
  value: string[]
  onChange: (ids: string[]) => void
  /** Etiquetas pessoais do utilizador — sugestões para adicionar. */
  ownTags: EtiquetaLike[]
  /** Etiquetas já aplicadas ao inquérito (modo edição) — podem incluir tags de
   *  outros utilizadores, que continuam a poder ser mantidas/removidas. */
  initialTags?: EtiquetaLike[]
}

/**
 * Caixa de texto para atribuir etiquetas pessoais a um inquérito. Permite:
 *  - escolher de uma lista de sugestões (tags do próprio utilizador);
 *  - criar uma nova etiqueta escrevendo o nome e premindo Enter (com
 *    unificação no servidor: nomes repetidos reutilizam a tag existente).
 */
export function EtiquetaInput({ value, onChange, ownTags, initialTags = [] }: EtiquetaInputProps) {
  const [text, setText] = useState('')
  const [creating, setCreating] = useState(false)
  const [focused, setFocused] = useState(false)

  // Etiquetas criadas localmente durante esta sessão (não vieram nas props).
  const [localTags, setLocalTags] = useState<EtiquetaLike[]>([])

  // Mapa id→nome derivado reativamente: tags próprias + já aplicadas + criadas agora.
  const known = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of ownTags) m.set(t.id, t.nome)
    for (const t of initialTags) m.set(t.id, t.nome)
    for (const t of localTags) m.set(t.id, t.nome)
    return m
  }, [ownTags, initialTags, localTags])

  const nomeFor = (id: string) => known.get(id) ?? id

  const trimmed = text.trim()

  // Sugestões: tags do utilizador ainda não selecionadas, filtradas pelo texto.
  const suggestions = useMemo(() => {
    const q = trimmed.toLowerCase()
    return ownTags
      .filter((t) => !value.includes(t.id))
      .filter((t) => (q ? t.nome.toLowerCase().includes(q) : true))
      .slice(0, 8)
  }, [ownTags, value, trimmed])

  // Já existe (entre as conhecidas) uma tag exatamente com este nome?
  const exactMatch = useMemo(() => {
    if (!trimmed) return null
    const q = trimmed.toLowerCase()
    for (const [id, nome] of known) {
      if (nome.toLowerCase() === q) return { id, nome }
    }
    return null
  }, [trimmed, known])

  function addId(id: string, nome: string) {
    if (!known.has(id)) {
      setLocalTags((prev) => [...prev, { id, nome }])
    }
    if (!value.includes(id)) onChange([...value, id])
    setText('')
  }

  function removeId(id: string) {
    onChange(value.filter((x) => x !== id))
  }

  async function commitText() {
    if (!trimmed || creating) return
    // Reutiliza uma tag conhecida com o mesmo nome (case-insensitive).
    if (exactMatch) {
      if (!value.includes(exactMatch.id)) addId(exactMatch.id, exactMatch.nome)
      else setText('')
      return
    }
    // Caso contrário, cria (ou unifica no servidor) e adiciona.
    setCreating(true)
    try {
      const res = await fetch('/api/etiquetas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: trimmed }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao criar etiqueta')
        return
      }
      const tag: EtiquetaLike = await res.json()
      addId(tag.id, tag.nome)
    } finally {
      setCreating(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitText()
    } else if (e.key === 'Backspace' && !text && value.length > 0) {
      removeId(value[value.length - 1])
    }
  }

  return (
    <div className="space-y-2">
      {/* Chips selecionados */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              <Tag className="h-3 w-3 shrink-0 opacity-70" />
              {nomeFor(id)}
              <button
                type="button"
                onClick={() => removeId(id)}
                className="ml-0.5 rounded hover:text-red-600"
                aria-label={`Remover etiqueta ${nomeFor(id)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Caixa de texto + sugestões */}
      <div className="relative">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder="Escreva e prima Enter para criar/atribuir uma etiqueta"
          aria-label="Adicionar etiqueta"
        />
        {focused && (suggestions.length > 0 || (trimmed && !exactMatch)) && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => addId(s.id, s.nome)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Tag className="h-3.5 w-3.5 opacity-70" />
                {s.nome}
              </button>
            ))}
            {trimmed && !exactMatch && (
              <button
                type="button"
                onClick={commitText}
                disabled={creating}
                className="flex w-full items-center gap-2 border-t px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Criar «{trimmed}»
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
