'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'
import type { Role } from '@/generated/prisma/enums'
import { Shield } from 'lucide-react'
import { APP_VERSION } from '@/lib/version'

interface SidebarNavProps {
  role: Role
  onNavigate?: () => void
}

export function SidebarNav({ role, onNavigate }: SidebarNavProps) {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-5 border-b">
        <div className="bg-blue-600 p-1.5 rounded-md">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-sm leading-none">GPI</p>
          <p className="text-xs text-muted-foreground leading-none mt-0.5">Gestão de Processos</p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-3 border-t">
        <p className="text-[11px] text-muted-foreground leading-none">
          Versão <span className="font-mono">{APP_VERSION}</span>
        </p>
      </div>
    </div>
  )
}
