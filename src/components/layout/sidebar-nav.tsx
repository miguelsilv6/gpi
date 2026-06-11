'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from './nav-items'
import type { Role } from '@/generated/prisma/enums'
import { Shield } from 'lucide-react'
import { APP_VERSION } from '@/lib/version'
import { useBrand, useBrandAssetUrl } from '@/components/brand-provider'

interface SidebarNavProps {
  role: Role
  moduloAjudasAtivo?: boolean
  moduloFeriasAtivo?: boolean
  moduloBugReportsAtivo?: boolean
  moduloToolboxAtivo?: boolean
  onNavigate?: () => void
}

export function SidebarNav({ role, moduloAjudasAtivo = true, moduloFeriasAtivo = true, moduloBugReportsAtivo = true, moduloToolboxAtivo = true, onNavigate }: SidebarNavProps) {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false
    if (item.href === '/ajudas-mensais' && !moduloAjudasAtivo && role !== 'ADMINISTRACAO') return false
    if (item.href === '/ferias' && !moduloFeriasAtivo && role !== 'ADMINISTRACAO') return false
    if (item.href === '/reportar-bug' && !moduloBugReportsAtivo && role !== 'ADMINISTRACAO') return false
    if (item.href === '/toolbox' && !moduloToolboxAtivo && role !== 'ADMINISTRACAO') return false
    return true
  })
  const brand = useBrand()
  const lightLogo = useBrandAssetUrl('light')
  const darkLogo = useBrandAssetUrl('dark')
  const { resolvedTheme } = useTheme()
  // Evita hydration mismatch: o resolvedTheme só está disponível após o
  // primeiro paint do cliente. Antes disso usamos sempre a variante light
  // (que coincide com o que o servidor renderizou).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const logo = mounted && resolvedTheme === 'dark' && darkLogo ? darkLogo : lightLogo

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-5 border-b">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-8 w-8 rounded-md object-contain" />
        ) : (
          <div className="bg-blue-600 p-1.5 rounded-md">
            <Shield className="h-5 w-5 text-white" />
          </div>
        )}
        <div>
          <p className="font-bold text-sm leading-none">{brand.appShortName}</p>
          <p className="text-xs text-muted-foreground leading-none mt-0.5">
            {brand.appDescription}
          </p>
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
        {brand.appAuthor && (
          <p className="text-[11px] text-muted-foreground leading-none mt-1 truncate" title={brand.appAuthor}>
            {brand.appAuthor}
          </p>
        )}
      </div>
    </div>
  )
}
