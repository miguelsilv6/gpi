import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere, canEditInquerito } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { isTerminal } from '@/lib/inquerito-state'
import { EstadoBadge } from '@/components/inqueritos/estado-badge'
import { FaseBadge } from '@/components/inqueritos/fase-badge'
import { AuditHistory } from '@/components/inqueritos/audit-history'
import { ReopenDialog } from '@/components/inqueritos/reopen-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatDate, formatDateTime, isOverdue, cn, slugToNuipc, nuipcToSlug } from '@/lib/utils'
import { ChevronLeft, Edit, AlertTriangle, Calendar, User, FileText, BarChart2, Bell } from 'lucide-react'
import Link from 'next/link'
import type { Role } from '@/generated/prisma/enums'

const ATIVIDADES_PAGE_SIZE = 50

export default async function InqueritoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ nuipc: string }>
  searchParams: Promise<{ ativPage?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { nuipc: slug } = await params
  const { ativPage } = await searchParams
  const ativPageNum = Math.max(1, parseInt(ativPage ?? '1'))
  const nuipc = slugToNuipc(slug)
  const role = session.user.role as Role
  const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)

  const inquerito = await prisma.inquerito.findFirst({
    where: { nuipc, deletedAt: null, ...roleWhere },
    include: {
      brigada: { select: { id: true, nome: true } },
      inspetor: { select: { id: true, nome: true, email: true } },
      _count: { select: { atividades: true } },
    },
  })

  if (!inquerito) notFound()

  // Pagination for atividades
  const atividades = await prisma.atividade.findMany({
    where: { inqueritoid: inquerito.id },
    orderBy: { dataRealizacao: 'desc' },
    skip: (ativPageNum - 1) * ATIVIDADES_PAGE_SIZE,
    take: ATIVIDADES_PAGE_SIZE,
    include: { realizadaPor: { select: { id: true, nome: true } } },
  })

  // Aggregated summary by type (uses ALL activities, not just the page)
  const summary = await prisma.atividade.groupBy({
    by: ['descricao'],
    where: { inqueritoid: inquerito.id },
    _count: { _all: true },
    _sum: { quantidade: true },
  })

  const totalAtividades = inquerito._count.atividades
  const totalAtivPages = Math.ceil(totalAtividades / ATIVIDADES_PAGE_SIZE)

  const canEdit = canEditInquerito(role, session.user.id, session.user.brigadaId, inquerito)
  const canReopen = hasPermission(role, 'inquerito:reopen')
  const canSeeAudit = hasPermission(role, 'inquerito:audit:read')
  const terminal = isTerminal(inquerito.estado)

  const overdue =
    isOverdue(inquerito.dataPrazo) && !terminal

  const inqSlug = nuipcToSlug(inquerito.nuipc)

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Link
          href="/inqueritos"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Inquéritos
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold font-mono tracking-tight">{inquerito.nuipc}</h1>
            {overdue && (
              <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Prazo vencido
              </span>
            )}
          </div>
          {inquerito.nai && (
            <p className="text-sm font-mono text-muted-foreground mt-0.5">
              NAI: {inquerito.nai}
            </p>
          )}
          <p className="text-muted-foreground mt-1">{inquerito.natureza}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <EstadoBadge estado={inquerito.estado} />
            <FaseBadge fase={inquerito.faseProcessual} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {canEdit && !terminal && (
            <Button size="sm" variant="outline">
              <Link href={`/inqueritos/${inqSlug}/editar`} className="flex items-center gap-1.5">
                <Edit className="h-3.5 w-3.5" />
                Editar
              </Link>
            </Button>
          )}
          {canReopen && terminal && <ReopenDialog slug={inqSlug} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Datas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Abertura</span>
              <span className="font-medium">{formatDate(inquerito.dataAbertura)}</span>
            </div>
            {inquerito.dataPrazo && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prazo</span>
                <span className={cn('font-medium', overdue && 'text-red-600')}>
                  {formatDate(inquerito.dataPrazo)}
                </span>
              </div>
            )}
            {inquerito.dataConclusao && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Conclusão</span>
                <span className="font-medium">{formatDate(inquerito.dataConclusao)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <User className="h-4 w-4" />
              Atribuição
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Brigada</span>
              <span className="font-medium">{inquerito.brigada.nome}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Inspetor</span>
              <span className="font-medium">
                {inquerito.inspetor?.nome ?? (
                  <span className="text-muted-foreground italic">Não atribuído</span>
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {inquerito.notas && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              Notas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{inquerito.notas}</p>
          </CardContent>
        </Card>
      )}

      {/* Activity count by type — uses aggregated groupBy across ALL activities */}
      {summary.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <BarChart2 className="h-4 w-4" />
              Resumo por tipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary
                .sort((a, b) => b._count._all - a._count._all)
                .map((s) => (
                  <div
                    key={s.descricao}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">{s.descricao}</span>
                    <span className="font-medium tabular-nums">
                      {s._count._all}×
                      {s._sum.quantidade != null && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (total: {s._sum.quantidade})
                        </span>
                      )}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Atividades ({totalAtividades})
            </CardTitle>
            {!terminal && (
              <Button size="sm" variant="outline">
                <Link href={`/inqueritos/${inqSlug}/atividade`} className="flex items-center gap-1.5 text-xs">
                  + Adicionar
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {totalAtividades === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sem atividades registadas.
            </p>
          ) : (
            <>
              <div className="space-y-4">
                {atividades.map((atv, idx) => {
                  const atvOverdue = atv.dataPrazo && new Date(atv.dataPrazo) < new Date()
                  return (
                    <div key={atv.id}>
                      {idx > 0 && <Separator className="mb-4" />}
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-medium">
                          {atv.realizadaPor.nome.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{atv.realizadaPor.nome}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(atv.dataRealizacao)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                              {atv.descricao}
                            </span>
                            {atv.quantidade != null && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                Qtd: {atv.quantidade}
                              </span>
                            )}
                            {atv.dataPrazo && (
                              <span className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                                atvOverdue
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                  : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
                              )}>
                                <Bell className="h-3 w-3" />
                                Prazo: {formatDate(atv.dataPrazo)}
                              </span>
                            )}
                          </div>
                          {atv.observacoes && (
                            <p className="text-sm mt-1.5 text-muted-foreground whitespace-pre-wrap">
                              {atv.observacoes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {totalAtivPages > 1 && (
                <div className="flex items-center justify-between text-sm mt-6">
                  <span className="text-muted-foreground">
                    Página {ativPageNum} de {totalAtivPages}
                  </span>
                  <div className="flex gap-2">
                    {ativPageNum > 1 && (
                      <Link
                        href={`/inqueritos/${inqSlug}?ativPage=${ativPageNum - 1}`}
                        className="px-3 py-1.5 rounded-lg border hover:bg-accent transition-colors"
                      >
                        Anterior
                      </Link>
                    )}
                    {ativPageNum < totalAtivPages && (
                      <Link
                        href={`/inqueritos/${inqSlug}?ativPage=${ativPageNum + 1}`}
                        className="px-3 py-1.5 rounded-lg border hover:bg-accent transition-colors"
                      >
                        Próxima
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {canSeeAudit && <AuditHistory slug={inqSlug} />}
    </div>
  )
}
