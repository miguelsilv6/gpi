import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/rbac'
import { EstatisticaMensalView } from '@/components/estatistica-mensal/estatistica-mensal-view'
import type { Role } from '@/generated/prisma/enums'

export default async function EstatisticaMensalPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'estatistica:read')) redirect('/dashboard')

  const lockedToBrigada = role === 'INSPETOR_CHEFE'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Estatística Mensal</h1>
        <p className="text-muted-foreground text-sm">
          {lockedToBrigada
            ? 'Contagem mensal de atividades da sua brigada (apenas atividades que contam para estatística)'
            : 'Contagem mensal de atividades por brigada (apenas atividades que contam para estatística)'}
        </p>
      </div>
      <EstatisticaMensalView />
    </div>
  )
}
