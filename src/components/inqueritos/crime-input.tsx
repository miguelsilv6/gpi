'use client'

import { useMemo, useState } from 'react'
import { Scale, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface CrimeLike {
  id: string
  nome: string
  ativo?: boolean
}

interface CrimeInputProps {
  /** Ids selecionados (controlado pelo form). */
  value: string[]
  onChange: (ids: string[]) => void
  /** Catálogo de crimes disponíveis para seleção. */
  crimes: CrimeLike[]
  /** Id do crime principal — excluído da lista de associados. */
  excludeId?: string
}

/**
 * Seletor multi-chip para crimes associados a um inquérito.
 * Reutiliza o padrão visual das etiquetas mas opera sobre o catálogo
 * de crimes (sem criação — apenas seleção).
 */
export function CrimeInput({ value, onChange, crimes, excludeId }: CrimeInputProps) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)

  // All crimes available for selection: active OR already selected (even if deactivated).
  const available = useMemo(
    () => crimes.filter((c) => c.id !== excludeId && (c.ativo !== false || value.includes(c.id))),
    [crimes, excludeId, value],
  )

  const nomeFor = (id: string) => crimes.find((c) => c.id === id)?.nome ?? id

  const trimmed = text.trim().toLowerCase()

  const suggestions = useMemo(() => {
    return available
      .filter((c) => !value.includes(c.id))
      .filter((c) => (trimmed ? c.nome.toLowerCase().includes(trimmed) : true))
      .slice(0, 8)
  }, [available, value, trimmed])

  function addId(id: string) {
    if (!value.includes(id)) onChange([...value, id])
    setText('')
  }

  function removeId(id: string) {
    onChange(value.filter((x) => x !== id))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !text && value.length > 0) {
      removeId(value[value.length - 1])
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              <Scale className="h-3 w-3 shrink-0 opacity-70" />
              {nomeFor(id)}
              <button
                type="button"
                onClick={() => removeId(id)}
                className="ml-0.5 rounded hover:text-red-600"
                aria-label={`Remover ${nomeFor(id)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder="Pesquisar crime para associar…"
          aria-label="Adicionar crime associado"
        />
        {focused && suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
            {suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => addId(c.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Scale className="h-3.5 w-3.5 opacity-70" />
                {c.nome}
                {c.ativo === false && (
                  <span className="ml-auto text-xs text-muted-foreground">(inativo)</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
