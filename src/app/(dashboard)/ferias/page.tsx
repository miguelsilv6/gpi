import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/rbac'
import { isModuloFeriasAtivo } from '@/lib/ferias-module'
import { AccessDenied } from '@/components/access-denied'
import { FeriasView } from '@/components/ferias/ferias-view'
import { prisma } from '@/lib/prisma'
import type { Role } from '@/generated/prisma/enums'
import { CalendarDays } from 'lucide-react'

export default async function FeriasPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'ferias:own')) {
    return <AccessDenied message="Não dispões de privilégios para ver o módulo de Férias." />
  }

  const moduloAtivo = await isModuloFeriasAtivo(role)
  if (!moduloAtivo) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted text-muted-foreground">
          <CalendarDays className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-semibold">Módulo desativado</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          O módulo de Férias está desativado. Contacte o administrador do sistema para mais informações.
        </p>
      </div>
    )
  }

  const canViewAll = hasPermission(role, 'ferias:read:all')
  const canViewBrigade = canViewAll || hasPermission(role, 'ferias:read:brigade')

  // For roles that can view any brigade (COORDENADOR, ADMINISTRACAO), fetch the
  // full brigade list so the client can render a selector.
  const brigadas = canViewAll
    ? await prisma.brigada.findMany({
        where: { ativa: true },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
    : []

  return (
    <FeriasView
      canViewBrigade={canViewBrigade}
      canViewAll={canViewAll}
      userBrigadaId={session.user.brigadaId ?? null}
      brigadas={brigadas}
    />
  )
}
