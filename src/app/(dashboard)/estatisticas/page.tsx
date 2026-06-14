import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/rbac'
import { EstatisticasDashboard } from '@/components/estatisticas/estatisticas-dashboard'
import { AccessDenied } from '@/components/access-denied'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
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
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Estatísticas</h1>
          <p className="text-muted-foreground text-sm">
            {lockedToBrigada ? 'Análise da sua brigada' : 'Análise de inquéritos'}
          </p>
        </div>
        <HelpButton title="Ajuda — Estatísticas" className="shrink-0">
          <HelpSection title="Gráficos disponíveis">
            <p>O painel apresenta vários gráficos sobre os inquéritos: distribuição por estado, por natureza, evolução mensal de abertura e fecho, e ranking de inspetores por volume de trabalho.</p>
          </HelpSection>
          <HelpSection title="Filtros">
            <p>Use o seletor de <strong>Brigada</strong> e de <strong>Inspetor</strong> para restringir a análise a um subconjunto. O seletor de brigada está disponível para coordenadores e estatística.</p>
          </HelpSection>
          <HelpSection title="Análise de desempenho">
            <p>O botão <strong>Análise de desempenho</strong> abre uma vista aprofundada com métricas individuais e comparativas por período.</p>
          </HelpSection>
        </HelpButton>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/estatisticas/analise"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <TrendingUp className="h-4 w-4 mr-1" />
          Análise de desempenho
        </Link>
      </div>
      <EstatisticasDashboard
        brigadas={brigadas}
        inspetores={inspetores}
        lockedToBrigada={lockedToBrigada}
      />
    </div>
  )
}
