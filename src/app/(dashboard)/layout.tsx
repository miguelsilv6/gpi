import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Header } from '@/components/layout/header'
import type { Role } from '@/generated/prisma/enums'
import { Wrench } from 'lucide-react'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role

  const sysConfig = await prisma.configuracaoSistema.findUnique({
    where: { id: 'singleton' },
    select: { maintenanceMode: true, moduloAjudasAtivo: true },
  })

  // Maintenance mode gate — só ADMINISTRACAO passa enquanto o sistema está em
  // manutenção (e.g. durante um restauro). Outros utilizadores vêem uma
  // página neutra e voltam quando o admin desligar.
  if (role !== 'ADMINISTRACAO' && sysConfig?.maintenanceMode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <div className="max-w-md text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 text-amber-700">
            <Wrench className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">Sistema em manutenção</h1>
          <p className="text-muted-foreground text-sm">
            O sistema está temporariamente indisponível para operações de manutenção.
            Tente novamente daqui a alguns minutos.
          </p>
        </div>
      </div>
    )
  }

  const moduloAjudasAtivo = sysConfig?.moduloAjudasAtivo ?? true

  return (
    <div className="flex h-screen bg-muted/30">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-background shrink-0">
        <SidebarNav role={role} moduloAjudasAtivo={moduloAjudasAtivo} />
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          user={{
            nome: session.user.nome,
            email: session.user.email!,
            role,
          }}
          moduloAjudasAtivo={moduloAjudasAtivo}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <BottomNav role={role} moduloAjudasAtivo={moduloAjudasAtivo} />
    </div>
  )
}
