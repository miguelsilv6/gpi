import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere, canEditInquerito } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { isTerminal } from '@/lib/inquerito-state'
import { EstadoBadge } from '@/components/inqueritos/estado-badge'
import { AuditHistory } from '@/components/inqueritos/audit-history'
import { AccessDenied } from '@/components/access-denied'
import { ReopenDialog } from '@/components/inqueritos/reopen-dialog'
import { DeleteInqueritoButton } from '@/components/inqueritos/delete-inquerito-button'
import { AtividadesSection } from '@/components/inqueritos/atividades-section'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate, isOverdue, cn, slugToNuipc, nuipcToSlug } from '@/lib/utils'
import { ChevronLeft, Edit, AlertTriangle, Calendar, User, FileText, BarChart2, Gavel, Download, FileDown, UserSquare } from 'lucide-react'
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
      estado: { select: { id: true, codigo: true, nome: true, cor: true, terminal: true } },
      crime: { select: { id: true, nome: true } },
      brigada: { select: { id: true, nome: true } },
      inspetor: { select: { id: true, nome: true, email: true } },
      _count: { select: { atividades: true } },
    },
  })

  if (!inquerito) {
    // Distinguir "fora do meu âmbito" de "não existe": se existe sem o
    // roleWhere, o utilizador não tem acesso (403); senão, 404.
    const existsOutsideScope = await prisma.inquerito.findFirst({
      where: { nuipc, deletedAt: null },
      select: { id: true, brigadaId: true },
    })
    if (existsOutsideScope) {
      const isSameBrigada = session.user.brigadaId && existsOutsideScope.brigadaId === session.user.brigadaId
      const message = isSameBrigada
        ? 'Este inquérito pertence à tua brigada, mas está atribuído a outro inspetor.'
        : 'Este inquérito pertence a outra brigada — não dispões de privilégios para o consultar.'
      return (
        <AccessDenied
          title="Inquérito fora do teu âmbito"
          message={message}
          backHref="/inqueritos"
          backLabel="Voltar aos inquéritos"
        />
      )
    }
    notFound()
  }

  // Pagination for atividades
  const atividades = await prisma.atividade.findMany({
    where: { inqueritoid: inquerito.id },
    // Sorted by createdAt because that's what the page now displays — keeps
    // visual order coherent with the timestamp shown next to each entry.
    orderBy: { createdAt: 'desc' },
    skip: (ativPageNum - 1) * ATIVIDADES_PAGE_SIZE,
    take: ATIVIDADES_PAGE_SIZE,
    include: { realizadaPor: { select: { id: true, nome: true } } },
  })

  // Aggregated summary by type (uses ALL activities, not just the page).
  // Filtered to only count activity types that are flagged
  // `contaParaEstatistica`. Atividades whose padrão was deleted are NOT
  // included either (they can't be matched).
  // We pull all padrões in one go (not just those that count for statistics)
  // so the rendering layer can look up `temPrazo` / `categoriaDashboard` for
  // each atividade and decide which "Concluir" control to render.
  const todosPadroes = await prisma.atividadePadrao.findMany({
    select: {
      nome: true,
      temPrazo: true,
      temQuantidade: true,
      contaParaEstatistica: true,
      categoriaDashboard: true,
    },
  })
  const padraoByNome = new Map(todosPadroes.map((p) => [p.nome, p]))
  const nomesQueContam = todosPadroes
    .filter((p) => p.contaParaEstatistica)
    .map((p) => p.nome)
  const temQtdByNome = new Map(todosPadroes.map((p) => [p.nome, p.temQuantidade]))

  const summary = nomesQueContam.length
    ? await prisma.atividade.groupBy({
        by: ['descricao'],
        where: {
          inqueritoid: inquerito.id,
          descricao: { in: nomesQueContam },
        },
        _count: { _all: true },
        _sum: { quantidade: true },
      })
    : []

  const totalAtividades = inquerito._count.atividades
  const totalAtivPages = Math.ceil(totalAtividades / ATIVIDADES_PAGE_SIZE)

  const canEdit = canEditInquerito(role, session.user.id, session.user.brigadaId, inquerito)
  const terminal = isTerminal(inquerito.estado)
  // INSPETOR_CHEFE a ver inquérito atribuído a outro membro da brigada: bloquear
  // edição de atividades por omissão para evitar modificações acidentais.
  const editLocked = role === 'INSPETOR_CHEFE' && canEdit && inquerito.inspetorId !== session.user.id

  const atividadeItems = atividades.map((atv) => {
    const padraoMeta = padraoByNome.get(atv.descricao)
    const conclusaoMode: 'devolucao' | 'exame' | 'prazo' | null =
      padraoMeta?.categoriaDashboard === 'ENVIADO'
        ? 'devolucao'
        : padraoMeta?.categoriaDashboard === 'AGUARDA_EXAMES'
          ? 'exame'
          : padraoMeta?.temPrazo
            ? 'prazo'
            : null
    const canMutate =
      canEdit &&
      !terminal &&
      (role === 'INSPETOR' ? atv.realizadaPor.id === session.user.id : true)
    return {
      id: atv.id,
      descricao: atv.descricao,
      dataRealizacao: atv.dataRealizacao.toISOString(),
      createdAt: atv.createdAt.toISOString(),
      concluidaEm: atv.concluidaEm ? atv.concluidaEm.toISOString() : null,
      dataPrazo: atv.dataPrazo ? atv.dataPrazo.toISOString() : null,
      quantidade: atv.quantidade,
      observacoes: atv.observacoes,
      realizadaPor: atv.realizadaPor,
      conclusaoMode,
      canMutate,
      isOverdue: atv.dataPrazo ? isOverdue(atv.dataPrazo) && atv.concluidaEm == null : false,
    }
  })

  const canReopen = hasPermission(role, 'inquerito:reopen')
  const canSeeAudit = hasPermission(role, 'inquerito:audit:read')
  const canDelete = hasPermission(role, 'inquerito:delete')
  const canExport = hasPermission(role, 'inquerito:export')

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
          <p className="text-muted-foreground mt-1">
            {inquerito.crime?.nome ?? inquerito.natureza}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <EstadoBadge estado={inquerito.estado} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {canExport && (
            <>
              <Button size="sm" variant="outline">
                <a
                  href={`/api/inqueritos/${inqSlug}/export?format=csv`}
                  className="flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </a>
              </Button>
              <Button size="sm" variant="outline">
                <a
                  href={`/inqueritos/${inqSlug}/print`}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-1.5"
                  title="Abre uma vista pronta para imprimir / guardar como PDF"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  PDF
                </a>
              </Button>
            </>
          )}
          {canEdit && !terminal && (
            <Button size="sm" variant="outline">
              <Link href={`/inqueritos/${inqSlug}/editar`} className="flex items-center gap-1.5">
                <Edit className="h-3.5 w-3.5" />
                Editar
              </Link>
            </Button>
          )}
          {canReopen && terminal && <ReopenDialog slug={inqSlug} />}
          {canDelete && <DeleteInqueritoButton nuipc={inquerito.nuipc} />}
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
              <span className="font-medium">{inquerito.brigada?.nome ?? '—'}</span>
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

      {(inquerito.denuncianteNome ||
        inquerito.denuncianteNif ||
        inquerito.denuncianteMorada ||
        inquerito.denuncianteCodPostal ||
        inquerito.denuncianteLocalidade ||
        inquerito.denuncianteContacto ||
        inquerito.denuncianteEmail ||
        inquerito.denuncianteResponsavel ||
        inquerito.denuncianteNotas) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <UserSquare className="h-4 w-4" />
              Denunciante
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {inquerito.denuncianteNome && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">
                  {inquerito.denuncianteTipo === 'COLETIVA' ? 'Designação' : 'Nome'}
                </span>
                <span className="font-medium text-right">
                  {inquerito.denuncianteNome}
                  {inquerito.denuncianteTipo === 'COLETIVA' && (
                    <span className="ml-2 text-xs text-muted-foreground">(pessoa coletiva)</span>
                  )}
                  {inquerito.denuncianteTipo === 'SINGULAR' && (
                    <span className="ml-2 text-xs text-muted-foreground">(pessoa singular)</span>
                  )}
                </span>
              </div>
            )}
            {inquerito.denuncianteNif && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">
                  {inquerito.denuncianteTipo === 'COLETIVA' ? 'NIPC' : 'NIF'}
                </span>
                <span className="font-medium text-right font-mono">{inquerito.denuncianteNif}</span>
              </div>
            )}
            {(inquerito.denuncianteMorada ||
              inquerito.denuncianteCodPostal ||
              inquerito.denuncianteLocalidade) && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Morada</span>
                <span className="font-medium text-right">
                  {[
                    inquerito.denuncianteMorada,
                    [inquerito.denuncianteCodPostal, inquerito.denuncianteLocalidade]
                      .filter(Boolean)
                      .join(' '),
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
            )}
            {inquerito.denuncianteContacto && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Contacto</span>
                <span className="font-medium text-right font-mono">{inquerito.denuncianteContacto}</span>
              </div>
            )}
            {inquerito.denuncianteEmail && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Email</span>
                <span className="font-medium text-right">{inquerito.denuncianteEmail}</span>
              </div>
            )}
            {inquerito.denuncianteResponsavel && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Responsável</span>
                <span className="font-medium text-right">{inquerito.denuncianteResponsavel}</span>
              </div>
            )}
            {inquerito.denuncianteNotas && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Notas</p>
                <p className="text-sm whitespace-pre-wrap">{inquerito.denuncianteNotas}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(inquerito.tribunal ||
        inquerito.procurador ||
        inquerito.oficialJustica ||
        inquerito.voip ||
        inquerito.notasTribunal) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <Gavel className="h-4 w-4" />
              Tribunal / M.P.
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {inquerito.tribunal && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Tribunal / M.P.</span>
                <span className="font-medium text-right">{inquerito.tribunal}</span>
              </div>
            )}
            {inquerito.procurador && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Procurador/a</span>
                <span className="font-medium text-right">{inquerito.procurador}</span>
              </div>
            )}
            {inquerito.oficialJustica && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Oficial de Justiça</span>
                <span className="font-medium text-right">{inquerito.oficialJustica}</span>
              </div>
            )}
            {inquerito.voip && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">VoIP / Contacto</span>
                <span className="font-medium text-right font-mono">{inquerito.voip}</span>
              </div>
            )}
            {inquerito.notasTribunal && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Notas</p>
                <p className="text-sm whitespace-pre-wrap">{inquerito.notasTribunal}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                .map((s) => {
                  // Atividades-padrão com `temQuantidade` mostram a quantidade
                  // somada (e.g. uma atividade com quantidade=4 mostra "4").
                  // As restantes mostram o número de linhas registadas.
                  const temQtd = temQtdByNome.get(s.descricao) ?? false
                  const display =
                    temQtd && s._sum.quantidade != null && s._sum.quantidade > 0
                      ? s._sum.quantidade
                      : s._count._all
                  return (
                    <div
                      key={s.descricao}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">{s.descricao}</span>
                      <span className="font-medium tabular-nums">{display}</span>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      <AtividadesSection
        atividades={atividadeItems}
        totalAtividades={totalAtividades}
        totalAtivPages={totalAtivPages}
        ativPageNum={ativPageNum}
        inqSlug={inqSlug}
        terminal={terminal}
        editLocked={editLocked}
      />

      {canSeeAudit && <AuditHistory slug={inqSlug} />}
    </div>
  )
}
