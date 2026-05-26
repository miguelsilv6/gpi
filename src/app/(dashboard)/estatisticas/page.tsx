import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/rbac'
import { EstatisticasDashboard } from '@/components/estatisticas/estatisticas-dashboard'
import { AccessDenied } from '@/components/access-denied'
import type { Role } from '@/generated/prisma/enums'

export default async function EstatisticasPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'estatistica:read')) {
    return <AccessDenied message="Não dispões de privilégios para ver estatísticas." />
  }

  // INSPETOR_CHEFE is locked to their own brigada — no brigada filter, no
  // "Por Brigada" chart, inspetores list scoped to their brigada.
  const lockedToBrigada = role === 'INSPETOR_CHEFE'

  const [brigadas, inspetores] = await Promise.all([
    lockedToBrigada
      ? Promise.resolve([])
      : prisma.brigada.findMany({
          orderBy: { nome: 'asc' },
          select: { id: true, nome: true },
        }),
    prisma.utilizador.findMany({
      where: {
        ativo: true,
        ...(lockedToBrigada
          ? { brigadaId: session.user.brigadaId ?? '__no_brigada__' }
          : {}),
      },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, brigadaId: true },
    }),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Estatísticas</h1>
        <p className="text-muted-foreground text-sm">
          {lockedToBrigada ? 'Análise da sua brigada' : 'Análise de inquéritos'}
        </p>
      </div>
      <EstatisticasDashboard
        brigadas={brigadas}
        inspetores={inspetores}
        lockedToBrigada={lockedToBrigada}
      />
    </div>
  )
}
