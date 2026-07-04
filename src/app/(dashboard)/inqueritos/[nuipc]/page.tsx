import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere, canEditInquerito } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { isTerminal } from '@/lib/inquerito-state'
import { isModuloAnexosAtivo } from '@/lib/anexos-module'
import { isModuloIntercecoesAtivo } from '@/lib/intercecoes-module'
import { getIntercecoesResumo } from '@/lib/intercecoes'
import { IntercecoesSection } from '@/components/intercecoes/intercecoes-section'
import { EstadoBadge } from '@/components/inqueritos/estado-badge'
import { AuditHistory } from '@/components/inqueritos/audit-history'
import { AccessDenied } from '@/components/access-denied'
import { ReopenDialog } from '@/components/inqueritos/reopen-dialog'
import { DeleteInqueritoButton } from '@/components/inqueritos/delete-inquerito-button'
import { AtividadesSection } from '@/components/inqueritos/atividades-section'
import { DocumentosSection } from '@/components/inqueritos/documentos-section'
import { NotasSection } from '@/components/inqueritos/notas-section'
import { TarefasSection, type TarefaItem } from '@/components/inqueritos/tarefas-section'
import { RelacoesSection } from '@/components/inqueritos/relacoes-section'
import { getRelacoesForInquerito } from '@/lib/relacoes'
import { getConexoesForInquerito } from '@/lib/conexoes'
import { ConexoesSection } from '@/components/inqueritos/conexoes-section'
import { getChecklistForInquerito } from '@/lib/checklist'
import { ChecklistSection } from '@/components/inqueritos/checklist-section'
import { getEstadoTimeline } from '@/lib/estado-timeline'
import { mergeTimelineEvents } from '@/lib/inquerito-timeline'
import { CronologiaSection } from '@/components/inqueritos/cronologia-section'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EtiquetaList } from '@/components/inqueritos/etiqueta-badge'
import { formatDate, isOverdue, cn, slugToNuipc, nuipcToSlug } from '@/lib/utils'
import { ChevronLeft, Edit, AlertTriangle, Calendar, User, FileText, BarChart2, Gavel, Download, FileDown, UserSquare, Mail, MonitorCog, Paperclip } from 'lucide-react'
import { DocumentacaoPendenteToggle } from '@/components/inqueritos/documentacao-pendente-toggle'
import Link from 'next/link'
import type { Role } from '@/generated/prisma/enums'
import { CopyNuipcButton } from '@/components/inqueritos/copy-nuipc-button'

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
      etiquetas: { select: { id: true, nome: true }, orderBy: { nome: 'asc' } },
      crimesAssociados: { select: { id: true, nome: true }, orderBy: { nome: 'asc' } },
      tribunal: { select: { id: true, nome: true } },
      seccao: { select: { id: true, nome: true } },
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
    include: {
      realizadaPor: { select: { id: true, nome: true } },
      controlo: {
        select: {
          id: true,
          periodoDias: true,
          concluidoEm: true,
          realizacoes: {
            where: { dataRealizacao: null },
            orderBy: { numero: 'asc' as const },
            take: 1,
            select: { id: true, numero: true, dataEsperada: true },
          },
        },
      },
    },
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
  const nomesAguardaExames = todosPadroes
    .filter((p) => p.categoriaDashboard === 'AGUARDA_EXAMES')
    .map((p) => p.nome)

  // aguardaExamesPendentes conta TODAS as atividades por concluir (não só as
  // da página atual), para o balão junto ao estado refletir a realidade
  // mesmo quando essas atividades estão fora da página de paginação.
  const [summary, aguardaExamesPendentes] = await Promise.all([
    nomesQueContam.length
      ? prisma.atividade.groupBy({
          by: ['descricao'],
          where: {
            inqueritoid: inquerito.id,
            descricao: { in: nomesQueContam },
          },
          _count: { _all: true },
          _sum: { quantidade: true },
        })
      : Promise.resolve([]),
    nomesAguardaExames.length
      ? prisma.atividade.count({
          where: {
            inqueritoid: inquerito.id,
            descricao: { in: nomesAguardaExames },
            concluidaEm: null,
          },
        })
      : Promise.resolve(0),
  ])

  const totalAtividades = inquerito._count.atividades
  const totalAtivPages = Math.ceil(totalAtividades / ATIVIDADES_PAGE_SIZE)

  // Mudanças de estado reconstruídas do AuditLog — alimentam a Cronologia.
  const estadoTimeline = await getEstadoTimeline(inquerito.id)

  // Documentos anexados (provas, relatórios, ofícios) — só quando o módulo Anexos
  // está ativo para o role do utilizador.
  const anexosAtivo = await isModuloAnexosAtivo(role)
  const intercecoesAtivo = await isModuloIntercecoesAtivo(role)
  const intercecoesResumo = intercecoesAtivo ? await getIntercecoesResumo(inquerito.id) : null
  const documentos = anexosAtivo
    ? await prisma.documento.findMany({
        where: { inqueritoid: inquerito.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          tamanho: true,
          sha256: true,
          createdAt: true,
          uploadedBy: { select: { id: true, nome: true } },
        },
      })
    : []

  // Notas de investigação — registo cronológico de notas por inquérito.
  const notas = await prisma.notaInquerito.findMany({
    where: { inqueritoId: inquerito.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      titulo: true,
      conteudo: true,
      createdAt: true,
      updatedAt: true,
      autor: { select: { id: true, nome: true } },
      editadoPor: { select: { id: true, nome: true } },
    },
  })

  // Tarefas pessoais — só as do utilizador actual.
  const tarefasRaw = role !== 'ESTATISTICA'
    ? await prisma.tarefaInquerito.findMany({
        where: { inqueritoId: inquerito.id, autorId: session.user.id },
        orderBy: [{ concluida: 'asc' }, { prioridade: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          titulo: true,
          descricao: true,
          prioridade: true,
          concluida: true,
          concluidaEm: true,
          createdAt: true,
        },
      })
    : []

  // Cronologia unificada — as fontes de secção (notas/documentos/tarefas)
  // reutilizam-se tal como a página as mostra (mesmo âmbito, por construção);
  // as atividades da secção são paginadas, por isso vai-se buscar o conjunto
  // completo em versão mínima, e as diligências não têm secção própria aqui.
  // Quem consegue abrir a página já passou o scope do inquérito — todas as
  // diligências deste inquérito são visíveis (igual a buildDiligenciaWhere).
  const [atividadesTimeline, diligenciasTimeline] = await Promise.all([
    prisma.atividade.findMany({
      where: { inqueritoid: inquerito.id },
      orderBy: { dataRealizacao: 'desc' },
      take: 500,
      select: {
        id: true,
        descricao: true,
        dataRealizacao: true,
        quantidade: true,
        realizadaPor: { select: { nome: true } },
      },
    }),
    prisma.diligencia.findMany({
      where: { inqueritoId: inquerito.id },
      orderBy: { dataInicio: 'desc' },
      take: 200,
      select: {
        id: true,
        titulo: true,
        dataInicio: true,
        local: true,
        criadoPor: { select: { nome: true } },
      },
    }),
  ])

  const timelineEvents = mergeTimelineEvents({
    abertura: {
      dataAbertura: inquerito.dataAbertura.toISOString(),
      crimeNome: inquerito.crime?.nome ?? inquerito.natureza,
    },
    estados: estadoTimeline.map((t) => ({
      at: t.at,
      estadoNome: t.estadoNome,
      porNome: t.porNome,
      ...(t.motivo ? { motivo: t.motivo } : {}),
    })),
    atividades: atividadesTimeline.map((a) => ({
      id: a.id,
      descricao: a.descricao,
      dataRealizacao: a.dataRealizacao.toISOString(),
      quantidade: a.quantidade,
      autorNome: a.realizadaPor?.nome ?? null,
    })),
    notas: notas.map((n) => ({
      id: n.id,
      titulo: n.titulo,
      conteudo: n.conteudo,
      createdAt: n.createdAt.toISOString(),
      autorNome: n.autor.nome,
    })),
    documentos: documentos.map((d) => ({
      id: d.id,
      filename: d.filename,
      createdAt: d.createdAt.toISOString(),
      autorNome: d.uploadedBy?.nome ?? null,
    })),
    tarefas: tarefasRaw.map((t) => ({
      id: t.id,
      titulo: t.titulo,
      createdAt: t.createdAt.toISOString(),
      concluida: t.concluida,
    })),
    diligencias: diligenciasTimeline.map((d) => ({
      id: d.id,
      titulo: d.titulo,
      dataInicio: d.dataInicio.toISOString(),
      local: d.local,
      autorNome: d.criadoPor?.nome ?? null,
    })),
  })

  const canEdit = canEditInquerito(role, session.user.id, session.user.brigadaId, inquerito)

  // A marca de documentação pendente é privada do autor: badge e estado do
  // toggle só refletem a marca para quem a criou; aos outros aparece como
  // não-marcado.
  const isMinhaDocPendente =
    inquerito.documentacaoPendente &&
    inquerito.documentacaoPendentePorId === session.user.id
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
    // Inspectors can conclude (confirm devolução/exame) activities created by
    // anyone — they don't need to be the creator to mark the outcome. Edit and
    // delete remain restricted to the creator via canMutate.
    const canConclude = canEdit && !terminal
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
      canConclude,
      isOverdue: atv.dataPrazo ? isOverdue(atv.dataPrazo) && atv.concluidaEm == null : false,
      controlo: atv.controlo
        ? {
            id: atv.controlo.id,
            periodoDias: atv.controlo.periodoDias,
            concluidoEm: atv.controlo.concluidoEm?.toISOString() ?? null,
            nextRealizacao: atv.controlo.realizacoes[0]
              ? {
                  id: atv.controlo.realizacoes[0].id,
                  numero: atv.controlo.realizacoes[0].numero,
                  dataEsperada: atv.controlo.realizacoes[0].dataEsperada.toISOString(),
                }
              : null,
          }
        : null,
    }
  })

  // Inquéritos relacionados (apensos/conexões) — simétrico e com scope aplicado.
  // Em paralelo, deteção automática de possíveis conexões pelo denunciante
  // (NIF/contacto/email) — os já formalmente relacionados não repetem lá.
  const [relacoes, conexoes, checklist] = await Promise.all([
    getRelacoesForInquerito(inquerito.id, role, session.user.id, session.user.brigadaId),
    getConexoesForInquerito(inquerito.id, role, session.user.id, session.user.brigadaId, {
      // Já em memória — evita o findUnique redundante dentro da lib.
      nif: inquerito.denuncianteNif,
      contacto: inquerito.denuncianteContacto,
      email: inquerito.denuncianteEmail,
    }),
    getChecklistForInquerito(inquerito.crimeId, inquerito.id),
  ])

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

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CopyNuipcButton nuipc={inquerito.nuipc} />
            {inquerito.cartaPrecatoria && (
              <span
                className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950/50 dark:text-orange-300"
                title="Carta Precatória"
              >
                <Mail className="h-3.5 w-3.5" />
                Carta Precatória
              </span>
            )}
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
          {inquerito.crimesAssociados.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {inquerito.crimesAssociados.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border"
                  title="Crime associado"
                >
                  {c.nome}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <EstadoBadge estado={inquerito.estado} />
            {aguardaExamesPendentes > 0 && (
              <span
                className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-950/50 dark:text-purple-300"
                title="Este inquérito tem exames por concluir"
              >
                <MonitorCog className="h-3.5 w-3.5" />
                Aguarda exames
              </span>
            )}
            {isMinhaDocPendente && (
              <span
                className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                title={inquerito.documentacaoPendenteNota ?? 'Documentação por juntar'}
              >
                <Paperclip className="h-3.5 w-3.5" />
                Documentação pendente
              </span>
            )}
            <EtiquetaList etiquetas={inquerito.etiquetas} max={inquerito.etiquetas.length} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end">
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
          {canEdit && (!inquerito.documentacaoPendente || isMinhaDocPendente) && (
            <DocumentacaoPendenteToggle
              slug={inqSlug}
              pendente={!!isMinhaDocPendente}
              nota={isMinhaDocPendente ? inquerito.documentacaoPendenteNota : null}
            />
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
            {inquerito.dataDistribuicao && (
              <div className="flex justify-between pt-1 border-t">
                <span className="text-muted-foreground">Distribuição</span>
                <span className="font-medium">{formatDate(inquerito.dataDistribuicao)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {inquerito.cartaPrecatoria &&
        (inquerito.titularNome ||
          inquerito.titularEmail ||
          inquerito.titularVoip ||
          inquerito.titularUnidade) && (
        <Card className="border-orange-200 dark:border-orange-900/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5 text-orange-700 dark:text-orange-300">
              <Mail className="h-4 w-4" />
              Inspetor Titular — Carta Precatória
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-xs text-muted-foreground -mt-1">
              Inquérito a devolver ao titular após as diligências.
            </p>
            {inquerito.titularNome && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Inspetor titular</span>
                <span className="font-medium text-right">{inquerito.titularNome}</span>
              </div>
            )}
            {inquerito.titularUnidade && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Unidade / Órgão</span>
                <span className="font-medium text-right">{inquerito.titularUnidade}</span>
              </div>
            )}
            {inquerito.titularEmail && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Email</span>
                <a
                  href={`mailto:${inquerito.titularEmail}`}
                  className="font-medium text-right text-blue-600 hover:underline dark:text-blue-400"
                >
                  {inquerito.titularEmail}
                </a>
              </div>
            )}
            {inquerito.titularVoip && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">VoIP / Contacto</span>
                <span className="font-medium text-right font-mono">{inquerito.titularVoip}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  {inquerito.denuncianteTipo === 'COLETIVA' || inquerito.denuncianteTipo === 'ENTIDADE_PUBLICA' ? 'Designação' : 'Nome'}
                </span>
                <span className="font-medium text-right">
                  {inquerito.denuncianteNome}
                  {inquerito.denuncianteTipo === 'SINGULAR' && (
                    <span className="ml-2 text-xs text-muted-foreground">(pessoa singular)</span>
                  )}
                  {inquerito.denuncianteTipo === 'COLETIVA' && (
                    <span className="ml-2 text-xs text-muted-foreground">(pessoa coletiva)</span>
                  )}
                  {inquerito.denuncianteTipo === 'ENTIDADE_PUBLICA' && (
                    <span className="ml-2 text-xs text-muted-foreground">(entidade pública)</span>
                  )}
                  {inquerito.denuncianteTipo === 'OUTROS' && (
                    <span className="ml-2 text-xs text-muted-foreground">(outros)</span>
                  )}
                </span>
              </div>
            )}
            {inquerito.denuncianteNif && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">
                  {inquerito.denuncianteTipo === 'COLETIVA' ? 'NIPC' : inquerito.denuncianteTipo === 'ENTIDADE_PUBLICA' ? 'NIF/NIPC' : 'NIF'}
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
        inquerito.seccao ||
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
                <span className="font-medium text-right">{inquerito.tribunal.nome}</span>
              </div>
            )}
            {inquerito.seccao && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground shrink-0">Secção</span>
                <span className="font-medium text-right">{inquerito.seccao.nome}</span>
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
              Notas do inquérito
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

      <RelacoesSection
        nuipcSlug={inqSlug}
        selfNuipc={inquerito.nuipc}
        relacoes={relacoes}
        canEdit={canEdit}
      />

      <ConexoesSection conexoes={conexoes} />

      <ChecklistSection checklist={checklist} />

      <AtividadesSection
        atividades={atividadeItems}
        totalAtividades={totalAtividades}
        totalAtivPages={totalAtivPages}
        ativPageNum={ativPageNum}
        inqSlug={inqSlug}
        terminal={terminal}
        editLocked={editLocked}
      />

      {intercecoesAtivo && intercecoesResumo && (
        <IntercecoesSection nuipcSlug={inqSlug} resumo={intercecoesResumo} />
      )}

      {anexosAtivo && (
        <DocumentosSection
          nuipcSlug={inqSlug}
          documentos={documentos.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }))}
          canUpload={canEdit && role !== 'ESTATISTICA'}
          currentUserId={session.user.id}
          isAdmin={hasPermission(role, 'inquerito:edit:all')}
        />
      )}

      {role !== 'ESTATISTICA' && (
        <TarefasSection
          nuipcSlug={inqSlug}
          tarefas={tarefasRaw.map((t) => ({
            id: t.id,
            titulo: t.titulo,
            descricao: t.descricao,
            prioridade: t.prioridade,
            concluida: t.concluida,
            concluidaEm: t.concluidaEm ? t.concluidaEm.toISOString() : null,
            createdAt: t.createdAt.toISOString(),
          }))}
          canAdd={true}
        />
      )}

      <NotasSection
        nuipcSlug={inqSlug}
        notas={notas.map((n) => ({
          ...n,
          createdAt: n.createdAt.toISOString(),
          updatedAt: n.updatedAt.toISOString(),
        }))}
        canAdd={canEdit && role !== 'ESTATISTICA'}
        currentUserId={session.user.id}
        isAdmin={hasPermission(role, 'inquerito:edit:all')}
      />

      <CronologiaSection events={timelineEvents} />

      {canSeeAudit && <AuditHistory slug={inqSlug} />}
    </div>
  )
}
