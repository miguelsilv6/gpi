'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react'
import { EstadosMultiSelect } from './estados-multi-select'

interface EstadoFilterOption {
  id: string
  codigo: string
  nome: string
}

interface CrimeFilterOption {
  id: string
  nome: string
}

interface EtiquetaFilterOption {
  id: string
  nome: string
}

interface InspetorFilterOption {
  id: string
  nome: string
}

const SORT_OPTIONS: Record<string, string> = {
  'updatedAt:desc': 'Última alteração',
  'dataAbertura:desc': 'Data de abertura (decrescente)',
  'dataAbertura:asc': 'Data de abertura (crescente)',
  'dataPrazo:asc': 'Prazo (asc)',
  'nuipc:asc': 'NUIPC (A→Z)',
}

export function InqueritoFilters({
  estados,
  estadosDefault = [],
  crimes,
  etiquetas = [],
  inspetoresFilter = [],
  currentUserId,
  showSemInspetor = true,
}: {
  estados: EstadoFilterOption[]
  /** System-wide default applied when the URL has no `estado` param. */
  estadosDefault?: string[]
  crimes: CrimeFilterOption[]
  etiquetas?: EtiquetaFilterOption[]
  /** Filled only for INSPETOR_CHEFE — brigade members for the inspetor filter. */
  inspetoresFilter?: InspetorFilterOption[]
  currentUserId?: string
  /** O INSPETOR só vê os próprios inquéritos (sempre atribuídos a si), pelo que
   *  este filtro não faz sentido para esse perfil. */
  showSemInspetor?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const update = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('page', '1')
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [searchParams, pathname, router],
  )

  const currentSort = (() => {
    const sort = searchParams.get('sort') ?? 'updatedAt'
    const order = searchParams.get('order') ?? 'desc'
    const key = `${sort}:${order}`
    return SORT_OPTIONS[key] ? key : 'updatedAt:desc'
  })()

  const overdue = searchParams.get('overdue') === '1'
  const semInspetor = searchParams.get('semInspetor') === '1'

  const hasAnyFilter =
    Array.from(searchParams.entries()).some(
      ([k]) => !['page'].includes(k),
    )

  function applySort(key: string | null) {
    if (!key) {
      update({ sort: null, order: null })
      return
    }
    const [sort, order] = key.split(':')
    update({ sort: sort ?? null, order: order ?? null })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar NUIPC ou NAI..."
            className="pl-8"
            defaultValue={searchParams.get('search') ?? ''}
            onChange={(e) => update({ search: e.target.value || null })}
          />
        </div>

        <EstadosMultiSelect
          estados={estados}
          value={(() => {
            const raw = searchParams.get('estado')
            // No param yet → apply system default (matches what server queries with)
            if (raw === null) return estadosDefault
            if (raw === '__none__' || raw === '') return []
            return raw.split(',').filter(Boolean)
          })()}
          onChange={(next) =>
            update({ estado: next.length > 0 ? next.join(',') : '__none__' })
          }
        />

        <Select
          value={searchParams.get('crimeId') || 'all'}
          onValueChange={(v) => update({ crimeId: !v || v === 'all' ? null : v })}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Crime">
              {(v: string) => {
                if (!v || v === 'all') return 'Todos os crimes'
                return crimes.find((c) => c.id === v)?.nome ?? 'Crime'
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os crimes</SelectItem>
            {crimes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {etiquetas.length > 0 && (
          <Select
            value={searchParams.get('etiquetaId') || 'all'}
            onValueChange={(v) => update({ etiquetaId: !v || v === 'all' ? null : v })}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Etiqueta">
                {(v: string) => {
                  if (!v || v === 'all') return 'Todas as etiquetas'
                  return etiquetas.find((e) => e.id === v)?.nome ?? 'Etiqueta'
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as etiquetas</SelectItem>
              {etiquetas.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {inspetoresFilter.length > 0 && (
          <Select
            value={searchParams.get('inspetorId') || 'all'}
            onValueChange={(v) => update({ inspetorId: !v || v === 'all' ? null : v })}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Inspetor">
                {(v: string) => {
                  if (!v || v === 'all') return 'Todos os inspetores'
                  if (v === currentUserId) return 'Meus inquéritos'
                  return inspetoresFilter.find((i) => i.id === v)?.nome ?? 'Inspetor'
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os inspetores</SelectItem>
              {currentUserId && (
                <SelectItem value={currentUserId}>Meus inquéritos</SelectItem>
              )}
              {inspetoresFilter
                .filter((i) => i.id !== currentUserId)
                .map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}

        <Select value={currentSort} onValueChange={applySort}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Ordenar">
              {(v: string) => SORT_OPTIONS[v] ?? 'Ordenar'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_OPTIONS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="gap-1.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Mais
          {advancedOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>

        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(pathname)}
            className="gap-1.5 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Limpar
          </Button>
        )}
      </div>

      {advancedOpen && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap rounded-lg border bg-muted/30 p-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={overdue}
              onChange={(e) => update({ overdue: e.target.checked ? '1' : null })}
              className="h-4 w-4 rounded border"
            />
            Apenas vencidos
          </label>

          {showSemInspetor && (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={semInspetor}
                onChange={(e) => update({ semInspetor: e.target.checked ? '1' : null })}
                className="h-4 w-4 rounded border"
              />
              Sem inspetor atribuído
            </label>
          )}

          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs text-muted-foreground">Abertura desde</label>
            <Input
              type="date"
              value={searchParams.get('dataAberturaFrom') ?? ''}
              onChange={(e) => update({ dataAberturaFrom: e.target.value || null })}
              className="h-9"
            />
          </div>

          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs text-muted-foreground">Abertura até</label>
            <Input
              type="date"
              value={searchParams.get('dataAberturaTo') ?? ''}
              onChange={(e) => update({ dataAberturaTo: e.target.value || null })}
              className="h-9"
            />
          </div>
        </div>
      )}
    </div>
  )
}
