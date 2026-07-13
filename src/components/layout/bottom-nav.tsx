'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { filterNavItems } from './nav-items'
import type { Role } from '@/generated/prisma/enums'

interface BottomNavProps {
  role: Role
  moduloAjudasAtivo?: boolean
  moduloFeriasAtivo?: boolean
  moduloBugReportsAtivo?: boolean
  moduloToolboxAtivo?: boolean
  moduloAgendaAtivo?: boolean
  moduloIntercecoesAtivo?: boolean
  moduloApreensoesAtivo?: boolean
}

export function BottomNav({ role, moduloAjudasAtivo = true, moduloFeriasAtivo = true, moduloBugReportsAtivo = true, moduloToolboxAtivo = true, moduloAgendaAtivo = true, moduloIntercecoesAtivo = true, moduloApreensoesAtivo = true }: BottomNavProps) {
  const pathname = usePathname()
  const items = filterNavItems(role, {
    moduloAjudasAtivo,
    moduloFeriasAtivo,
    moduloBugReportsAtivo,
    moduloToolboxAtivo,
    moduloAgendaAtivo,
    moduloIntercecoesAtivo,
    moduloApreensoesAtivo,
  }).slice(0, 5)

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t z-50 md:hidden">
      <div className="flex items-stretch h-16">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors min-h-[44px]',
                active ? 'text-blue-600' : 'text-muted-foreground',
              )}
            >
              <item.icon className={cn('h-5 w-5', active && 'text-blue-600')} />
              <span className="leading-none truncate max-w-[68px] text-center">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
