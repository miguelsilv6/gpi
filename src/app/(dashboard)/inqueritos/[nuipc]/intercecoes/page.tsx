import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere, canEditInquerito } from '@/lib/auth-helpers'
import { isModuloIntercecoesAtivo } from '@/lib/intercecoes-module'
import { getIntercecoesTree } from '@/lib/intercecoes'
import { isTerminal } from '@/lib/inquerito-state'
import { slugToNuipc } from '@/lib/utils'
import { AccessDenied } from '@/components/access-denied'
import { IntercecoesView, type AlvoDTO } from '@/components/intercecoes/intercecoes-view'
import { ChevronLeft, FileSpreadsheet } from 'lucide-react'
import type { Role } from '@/generated/prisma/enums'

export const dynamic = 'force-dynamic'

export default async function IntercecoesInqueritoPage({
  params,
}: {
  params: Promise<{ nuipc: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = session.user.role as Role

  if (!(await isModuloIntercecoesAtivo(role))) {
    return (
      <AccessDenied
        title="Módulo desativado"
        message="O módulo Interceções está desativado ou o teu perfil não tem acesso."
        backHref="/dashboard"
        backLabel="Voltar ao dashboard"
      />
    )
  }

  const { nuipc: slug } = await params
  const nuipc = slugToNuipc(slug)
  const brigadaId = session.user.brigadaId ?? null

  const inquerito = await prisma.inquerito.findFirst({
    where: {
      AND: [{ nuipc }, { deletedAt: null }, buildInqueritoWhere(role, session.user.id, brigadaId)],
    },
    select: {
      id: true,
      nuipc: true,
      inspetorId: true,
      brigadaId: true,
      estado: { select: { codigo: true, terminal: true } },
    },
  })
  if (!inquerito) {
    // Mesma distinção da página de detalhe: fora do âmbito (403) vs inexistente (404).
    const existsOutsideScope = await prisma.inquerito.findFirst({
      where: { nuipc, deletedAt: null },
      select: { id: true },
    })
    if (existsOutsideScope) {
      return (
        <AccessDenied
          title="Inquérito fora do teu âmbito"
          message="Não dispões de privilégios para consultar as interceções deste inquérito."
          backHref="/inqueritos"
          backLabel="Voltar aos inquéritos"
        />
      )
    }
    notFound()
  }

  const alvosRaw = await getIntercecoesTree(inquerito.id)
  const alvos: AlvoDTO[] = alvosRaw.map((a) => ({
    id: a.id,
    nome: a.nome,
    codigo: a.codigo,
    observacoes: a.observacoes,
    notas: a.notas,
    produtos: a._count.produtos,
    linhas: a.linhas.map((l) => ({
      ...l,
      dataInicio: l.dataInicio.toISOString(),
      dataFim: l.dataFim.toISOString(),
    })),
  }))

  const temAlvos = alvos.length > 0

  // Como nas atividades: edição bloqueada em estados terminais.
  const canEdit =
    role !== 'ESTATISTICA' &&
    canEditInquerito(role, session.user.id, brigadaId, inquerito) &&
    !isTerminal(inquerito.estado)

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            href={`/inqueritos/${slug}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="font-mono">{inquerito.nuipc}</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Controlo de Interceções</h1>
          <p className="text-muted-foreground text-sm">
            Alvos, linhas intercetadas (com alertas de fim) e produtos de interesse.
            {!canEdit && ' Modo de consulta.'}
          </p>
        </div>
        {temAlvos && (
          <a
            href={`/api/inqueritos/${slug}/intercecoes/export`}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground shrink-0"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Excel
          </a>
        )}
      </div>

      <IntercecoesView nuipcSlug={slug} alvos={alvos} canEdit={canEdit} />
    </div>
  )
}
