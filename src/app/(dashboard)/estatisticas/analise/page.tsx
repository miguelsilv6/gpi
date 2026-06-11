import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/rbac'
import { computeAnalise } from '@/lib/analise'
import { AccessDenied } from '@/components/access-denied'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendMensalChart, DistribuicaoResolucaoChart } from '@/components/estatisticas/analise-charts'
import { ArrowLeft, Timer, Target, FolderOpen, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import type { Role } from '@/generated/prisma/enums'

export const dynamic = 'force-dynamic'

export default async function AnalisePage({
  searchParams,
}: {
  searchParams: Promise<{ brigadaId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'estatistica:read')) {
    return <AccessDenied message="Não dispões de privilégios para ver estatísticas." />
  }

  const params = await searchParams
  const lockedToBrigada = role === 'INSPETOR_CHEFE'
  const brigadaId = lockedToBrigada
    ? (session.user.brigadaId ?? '__sem_brigada__')
    : (params.brigadaId || null)

  const [analise, brigadas] = await Promise.all([
    computeAnalise(brigadaId),
    lockedToBrigada
      ? Promise.resolve([])
      : prisma.brigada.findMany({
          where: { ativa: true },
          orderBy: { nome: 'asc' },
          select: { id: true, nome: true },
        }),
  ])

  const kpis = [
    {
      label: 'Tempo médio de resolução',
      value: analise.tempoMedioResolucaoDias != null ? `${analise.tempoMedioResolucaoDias} dias` : '—',
      sub: 'concluídos nos últimos 12 meses',
      icon: Timer,
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400',
    },
    {
      label: 'Dentro do prazo',
      value: analise.taxaDentroPrazo != null ? `${analise.taxaDentroPrazo}%` : '—',
      sub: 'concluídos com prazo definido',
      icon: Target,
      color: 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400',
    },
    {
      label: 'Ativos hoje',
      value: String(analise.ativos),
      sub: `${analise.concluidos12m} concluídos em 12 meses`,
      icon: FolderOpen,
      color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400',
    },
    {
      label: 'Prazos vencidos',
      value: String(analise.vencidosHoje),
      sub: 'inquéritos ativos com prazo ultrapassado',
      icon: AlertTriangle,
      color: 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400',
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Análise de desempenho</h1>
          <p className="text-muted-foreground text-sm">
            {lockedToBrigada
              ? 'Métricas de resolução da sua brigada'
              : 'Métricas de resolução e cumprimento de prazos'}
          </p>
        </div>
        <Link
          href="/estatisticas"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Estatísticas
        </Link>
      </div>

      {!lockedToBrigada && brigadas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/estatisticas/analise"
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              !brigadaId
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-muted',
            )}
          >
            Todas as brigadas
          </Link>
          {brigadas.map((b) => (
            <Link
              key={b.id}
              href={`/estatisticas/analise?brigadaId=${b.id}`}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                brigadaId === b.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:bg-muted',
              )}
            >
              {b.nome}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn('flex items-center justify-center w-10 h-10 rounded-lg shrink-0', k.color)}>
                  <k.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold leading-tight">{k.value}</p>
                  <p className="text-xs font-medium">{k.label}</p>
                  <p className="text-[11px] text-muted-foreground">{k.sub}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Abertos vs. concluídos (12 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendMensalChart data={analise.trendMensal} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Distribuição do tempo de resolução</CardTitle>
          </CardHeader>
          <CardContent>
            <DistribuicaoResolucaoChart data={analise.distribuicaoResolucao} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
