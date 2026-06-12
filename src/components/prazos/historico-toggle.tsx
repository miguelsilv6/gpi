'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Clock, CheckCircle2 } from 'lucide-react'

/**
 * Alterna entre os itens pendentes (por omissão) e o histórico de itens já
 * concluídos. Reflete-se no URL via `?historico=1` para que a página (server
 * component) inverta os filtros de `concluidaEm`/`concluidoEm`.
 */
export function HistoricoToggle({ historico }: { historico: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setHistorico = useCallback(
    (next: boolean) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next) params.set('historico', '1')
      else params.delete('historico')
      params.delete('page')
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams],
  )

  return (
    <div className="inline-flex rounded-lg border bg-card p-0.5" role="group">
      <button
        type="button"
        onClick={() => setHistorico(false)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
          !historico
            ? 'bg-foreground text-background'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Clock className="h-3.5 w-3.5" />
        Pendentes
      </button>
      <button
        type="button"
        onClick={() => setHistorico(true)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
          historico
            ? 'bg-foreground text-background'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Concluídos
      </button>
    </div>
  )
}
