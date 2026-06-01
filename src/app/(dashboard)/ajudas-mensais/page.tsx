import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/rbac'
import { AccessDenied } from '@/components/access-denied'
import { AjudasMensaisView } from '@/components/ajudas-mensais/ajudas-mensais-view'
import type { Role } from '@/generated/prisma/enums'

interface SearchParams {
  ano?: string
  mes?: string
  utilizadorId?: string
}

export default async function AjudasMensaisPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'ajudas:own')) {
    return <AccessDenied message="Não dispões de privilégios para ver ajudas mensais." />
  }

  const params = await searchParams
  const now = new Date()
  const parsedAno = parseInt(params.ano ?? '', 10)
  const parsedMes = parseInt(params.mes ?? '', 10)
  const ano = isNaN(parsedAno) ? now.getFullYear() : parsedAno
  const mes = isNaN(parsedMes) || parsedMes < 1 || parsedMes > 12 ? now.getMonth() + 1 : parsedMes

  const canViewAll = hasPermission(role, 'ajudas:read:all')
  const canViewBrigade = hasPermission(role, 'ajudas:read:brigade')
  const canManageConfig = hasPermission(role, 'ajudas:config')

  return (
    <AjudasMensaisView
      initialAno={ano}
      initialMes={mes}
      userId={session.user.id}
      initialViewingUserId={params.utilizadorId ?? null}
      userRole={role}
      canViewAll={canViewAll}
      canViewBrigade={canViewBrigade}
      canManageConfig={canManageConfig}
    />
  )
}
