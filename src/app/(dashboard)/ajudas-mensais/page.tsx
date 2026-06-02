import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/rbac'
import { isModuloAjudasAtivo } from '@/lib/ajudas-module'
import { AccessDenied } from '@/components/access-denied'
import { AjudasMensaisView } from '@/components/ajudas-mensais/ajudas-mensais-view'
import type { Role } from '@/generated/prisma/enums'
import { Banknote } from 'lucide-react'

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

  const moduloAtivo = await isModuloAjudasAtivo()
  if (!moduloAtivo && role !== 'ADMINISTRACAO') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted text-muted-foreground">
          <Banknote className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-semibold">Módulo desativado</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          O módulo de Ajudas Mensais está desativado. Contacte o administrador do sistema para mais informações.
        </p>
      </div>
    )
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
      userName={session.user.nome}
    />
  )
}
