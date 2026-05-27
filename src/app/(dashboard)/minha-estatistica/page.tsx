import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/rbac'
import { EstatisticaInspetorDashboard } from '@/components/estatisticas/estatistica-inspetor-dashboard'
import { AccessDenied } from '@/components/access-denied'
import type { Role } from '@/generated/prisma/enums'

export default async function MinhaEstatisticaPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'estatistica:own')) {
    return <AccessDenied message="Não dispões de privilégios para ver as suas estatísticas." />
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">As Minhas Estatísticas</h1>
        <p className="text-muted-foreground text-sm">Análise dos seus inquéritos</p>
      </div>
      <EstatisticaInspetorDashboard />
    </div>
  )
}
