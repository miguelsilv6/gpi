import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Header } from '@/components/layout/header'
import type { Role } from '@/generated/prisma/enums'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <div className="flex h-screen bg-muted/30">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-background shrink-0">
        <SidebarNav role={session.user.role as Role} />
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          user={{
            nome: session.user.nome,
            email: session.user.email!,
            role: session.user.role as Role,
          }}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <BottomNav role={session.user.role as Role} />
    </div>
  )
}
