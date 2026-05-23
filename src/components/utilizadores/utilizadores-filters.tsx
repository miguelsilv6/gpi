'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/rbac'

const ROLES = Object.entries(ROLE_LABELS) as [string, string][]
const ROLE_LABEL_MAP = ROLE_LABELS as Record<string, string>

export function UtilizadoresFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const search = searchParams.get('search') ?? ''
  const role = searchParams.get('role') ?? ''
  const ativo = searchParams.get('ativo') ?? ''

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      startTransition(() => router.push(`${pathname}?${params.toString()}`))
    },
    [router, pathname, searchParams],
  )

  const hasFilters = search || role || ativo

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
      <div className="relative flex-1 min-w-0 sm:min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Pesquisar por nome ou email..."
          className="pl-8 h-9 text-sm"
          defaultValue={search}
          onChange={(e) => update('search', e.target.value)}
        />
      </div>

      <Select value={role || 'all'} onValueChange={(v) => update('role', !v || v === 'all' ? '' : v)}>
        <SelectTrigger className="h-9 w-full sm:w-[160px] text-sm">
          <SelectValue placeholder="Todos os perfis">
            {(v: string) =>
              !v || v === 'all' ? 'Todos os perfis' : ROLE_LABEL_MAP[v] ?? v
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os perfis</SelectItem>
          {ROLES.map(([value, label]) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={ativo || 'all'} onValueChange={(v) => update('ativo', !v || v === 'all' ? '' : v)}>
        <SelectTrigger className="h-9 w-full sm:w-[130px] text-sm">
          <SelectValue placeholder="Estado">
            {(v: string) =>
              v === 'true' ? 'Activos' : v === 'false' ? 'Inactivos' : 'Todos'
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="true">Activos</SelectItem>
          <SelectItem value="false">Inactivos</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-2 text-muted-foreground"
          onClick={() => {
            startTransition(() => router.push(pathname))
          }}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Limpar
        </Button>
      )}

      {isPending && <span className="text-xs text-muted-foreground">A filtrar...</span>}
    </div>
  )
}
