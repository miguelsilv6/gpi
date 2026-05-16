'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ESTADO_LABELS, FASE_LABELS } from '@/lib/constants'
import { Search, X, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react'

const SORT_OPTIONS: Record<string, string> = {
  'updatedAt:desc': 'Última alteração',
  'dataAbertura:desc': 'Mais recentes',
  'dataAbertura:asc': 'Mais antigos',
  'dataPrazo:asc': 'Prazo (asc)',
  'nuipc:asc': 'NUIPC (A→Z)',
}

export function InqueritoFilters() {
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
            placeholder="Pesquisar NUIPC, NAI ou natureza..."
            className="pl-8"
            defaultValue={searchParams.get('search') ?? ''}
            onChange={(e) => update({ search: e.target.value || null })}
          />
        </div>

        <Select
          value={searchParams.get('estado') || ''}
          onValueChange={(v) => update({ estado: !v || v === 'all' ? null : v })}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            {Object.entries(ESTADO_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get('faseProcessual') || ''}
          onValueChange={(v) => update({ faseProcessual: !v || v === 'all' ? null : v })}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Fase processual" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as fases</SelectItem>
            {Object.entries(FASE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={currentSort} onValueChange={applySort}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Ordenar" />
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

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={semInspetor}
              onChange={(e) => update({ semInspetor: e.target.checked ? '1' : null })}
              className="h-4 w-4 rounded border"
            />
            Sem inspetor atribuído
          </label>

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
