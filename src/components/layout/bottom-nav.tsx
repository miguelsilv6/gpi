'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'
import type { Role } from '@/generated/prisma/enums'

interface BottomNavProps {
  role: Role
  moduloAjudasAtivo?: boolean
}

export function BottomNav({ role, moduloAjudasAtivo = true }: BottomNavProps) {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false
    if (item.href === '/ajudas-mensais' && !moduloAjudasAtivo && role !== 'ADMINISTRACAO') return false
    return true
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
