'use client'

import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { INQUERITO_PAGE_SIZES } from '@/lib/pagination'

/**
 * Seletor do número de inquéritos por página. Recebe os parâmetros de pesquisa
 * atuais do server component (evita `useSearchParams` e a suspense boundary
 * associada) e navega mudando `perPage`, repondo `page=1` e preservando todos
 * os restantes filtros.
 */
export function PageSizeSelect({
  value,
  currentParams,
}: {
  value: number
  currentParams: Record<string, string | undefined>
}) {
  const router = useRouter()

  function onChange(v: string | null) {
    if (!v) return
    const params = new URLSearchParams()
    for (const [k, val] of Object.entries(currentParams)) {
      // `page` é reposto (novo tamanho ⇒ voltar à 1ª página); `perPage` é o que
      // estamos a alterar.
      if (val && k !== 'page' && k !== 'perPage') params.set(k, String(val))
    }
    params.set('perPage', v)
    router.push(`/inqueritos?${params.toString()}`)
  }

  return (
    <Select value={String(value)} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-[4.5rem]" aria-label="Inquéritos por página">
        <SelectValue>{(v: string | null) => v ?? String(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {INQUERITO_PAGE_SIZES.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
