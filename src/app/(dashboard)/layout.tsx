import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Header } from '@/components/layout/header'
import { IdleTimeoutGuard } from '@/components/idle-timeout-guard'
import { WelcomeTour } from '@/components/tour/welcome-tour'
import { ServiceWorkerRegister } from '@/components/push/service-worker-register'
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

  const [sysConfig, utilizador] = await Promise.all([
    prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: {
        maintenanceMode: true,
        moduloAjudasAtivo: true,
        moduloAjudasRoles: true,
        moduloFeriasAtivo: true,
        moduloFeriasRoles: true,
        moduloBugReportsAtivo: true,
        moduloBugReportsRoles: true,
        moduloToolboxAtivo: true,
        moduloToolboxRoles: true,
        moduloAgendaAtivo: true,
        moduloAgendaRoles: true,
        moduloIntercecoesAtivo: true,
        moduloIntercecoesRoles: true,
        moduloApreensoesAtivo: true,
        moduloApreensoesRoles: true,
        moduloPericiasAtivo: true,
        moduloPericiasRoles: true,
        sessaoTimeoutMinutos: true,
      },
    }),
    prisma.utilizador.findUnique({
      where: { id: session.user.id },
      select: { tourConcluidaEm: true },
    }),
  ])

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

  function checkModuloAcesso(ativo: boolean | null | undefined, roles: string | null | undefined): boolean {
    if (role === 'ADMINISTRACAO') return true
    if (!(ativo ?? true)) return false
    return (roles ?? 'INSPETOR,INSPETOR_CHEFE,COORDENADOR').split(',').filter(Boolean).includes(role)
  }
  const moduloAjudasAtivo = checkModuloAcesso(sysConfig?.moduloAjudasAtivo, sysConfig?.moduloAjudasRoles)
  const moduloFeriasAtivo = checkModuloAcesso(sysConfig?.moduloFeriasAtivo, sysConfig?.moduloFeriasRoles)
  const moduloBugReportsAtivo = checkModuloAcesso(sysConfig?.moduloBugReportsAtivo, sysConfig?.moduloBugReportsRoles)
  const moduloToolboxAtivo = checkModuloAcesso(sysConfig?.moduloToolboxAtivo, sysConfig?.moduloToolboxRoles)
  const moduloAgendaAtivo = checkModuloAcesso(sysConfig?.moduloAgendaAtivo, sysConfig?.moduloAgendaRoles)
  const moduloIntercecoesAtivo = checkModuloAcesso(sysConfig?.moduloIntercecoesAtivo, sysConfig?.moduloIntercecoesRoles)
  const moduloApreensoesAtivo = checkModuloAcesso(sysConfig?.moduloApreensoesAtivo, sysConfig?.moduloApreensoesRoles)
  const moduloPericiasAtivo = checkModuloAcesso(sysConfig?.moduloPericiasAtivo, sysConfig?.moduloPericiasRoles)

  return (
    <div className="flex h-screen bg-muted/30">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-background shrink-0">
        <SidebarNav role={role} moduloAjudasAtivo={moduloAjudasAtivo} moduloFeriasAtivo={moduloFeriasAtivo} moduloBugReportsAtivo={moduloBugReportsAtivo} moduloToolboxAtivo={moduloToolboxAtivo} moduloAgendaAtivo={moduloAgendaAtivo} moduloIntercecoesAtivo={moduloIntercecoesAtivo} moduloApreensoesAtivo={moduloApreensoesAtivo} moduloPericiasAtivo={moduloPericiasAtivo} />
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
          moduloFeriasAtivo={moduloFeriasAtivo}
          moduloBugReportsAtivo={moduloBugReportsAtivo}
          moduloToolboxAtivo={moduloToolboxAtivo}
          moduloAgendaAtivo={moduloAgendaAtivo}
          moduloIntercecoesAtivo={moduloIntercecoesAtivo}
          moduloApreensoesAtivo={moduloApreensoesAtivo}
          moduloPericiasAtivo={moduloPericiasAtivo}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <BottomNav role={role} moduloAjudasAtivo={moduloAjudasAtivo} moduloFeriasAtivo={moduloFeriasAtivo} moduloBugReportsAtivo={moduloBugReportsAtivo} moduloToolboxAtivo={moduloToolboxAtivo} moduloAgendaAtivo={moduloAgendaAtivo} moduloIntercecoesAtivo={moduloIntercecoesAtivo} moduloApreensoesAtivo={moduloApreensoesAtivo} moduloPericiasAtivo={moduloPericiasAtivo} />

      <IdleTimeoutGuard timeoutMinutes={sysConfig?.sessaoTimeoutMinutos ?? 0} />

      <WelcomeTour
        role={role}
        done={utilizador?.tourConcluidaEm != null}
        modules={{
          moduloAjudasAtivo,
          moduloFeriasAtivo,
          moduloBugReportsAtivo,
          moduloToolboxAtivo,
          moduloAgendaAtivo,
          moduloIntercecoesAtivo,
          moduloApreensoesAtivo,
          moduloPericiasAtivo,
        }}
      />

      <ServiceWorkerRegister />
    </div>
  )
}
