'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'

export function BrigadasFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const search = searchParams.get('search') ?? ''
  const ativa = searchParams.get('ativa') ?? ''

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      startTransition(() => router.push(`${pathname}?${params.toString()}`))
    },
    [router, pathname, searchParams],
  )

  const hasFilters = search || ativa

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
      <div className="relative flex-1 min-w-0 sm:min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Pesquisar por nome..."
          className="pl-8 h-9 text-sm"
          defaultValue={search}
          onChange={(e) => update('search', e.target.value)}
        />
      </div>

      <Select value={ativa || 'all'} onValueChange={(v) => update('ativa', !v || v === 'all' ? '' : v)}>
        <SelectTrigger className="h-9 w-full sm:w-[130px] text-sm">
          <SelectValue placeholder="Estado">
            {(v: string) =>
              v === 'true' ? 'Ativas' : v === 'false' ? 'Inativas' : 'Todas'
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          <SelectItem value="true">Ativas</SelectItem>
          <SelectItem value="false">Inativas</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2 text-muted-foreground"
          onClick={() => startTransition(() => router.push(pathname))}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Limpar
        </Button>
      )}

      {isPending && <span className="text-xs text-muted-foreground">A filtrar...</span>}
    </div>
  )
}
