'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { cn } from '@/lib/utils'
import { CalendarClock, ClipboardCheck } from 'lucide-react'

type Panel = 'prazos' | 'controlos'

export function PanelTabs({ panel }: { panel: Panel }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setPanel = useCallback(
    (next: Panel) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next === 'prazos') params.delete('panel')
      else params.set('panel', next)
      // Reset page and view when switching panels
      params.delete('page')
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams],
  )

  return (
    <div className="inline-flex rounded-lg border bg-card p-0.5" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={panel === 'prazos'}
        onClick={() => setPanel('prazos')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
          panel === 'prazos'
            ? 'bg-foreground text-background'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <CalendarClock className="h-3.5 w-3.5" />
        Prazos
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={panel === 'controlos'}
        onClick={() => setPanel('controlos')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
          panel === 'controlos'
            ? 'bg-foreground text-background'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <ClipboardCheck className="h-3.5 w-3.5" />
        Controlos
      </button>
    </div>
  )
}
