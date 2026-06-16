import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/rbac'
import { buildInqueritoWhere } from '@/lib/role-scope'
import { AccessDenied } from '@/components/access-denied'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { TarefasBrowser, type TarefaBrowserItem } from '@/components/tarefas/tarefas-browser'
import { nuipcToSlug } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

export const dynamic = 'force-dynamic'

export default async function TarefasPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role

  const canRead =
    hasPermission(role, 'inquerito:read:own') ||
    hasPermission(role, 'inquerito:read:brigade') ||
    hasPermission(role, 'inquerito:read:all')
  // ESTATISTICA não cria tarefas, pelo que a página ficaria sempre vazia.
  if (!canRead || role === 'ESTATISTICA') {
    return <AccessDenied message="Não dispões de privilégios para ver as tarefas." />
  }

  const scope = buildInqueritoWhere(role, session.user.id, session.user.brigadaId ?? null)

  const rows = await prisma.tarefaInquerito.findMany({
    where: {
      autorId: session.user.id,
      inquerito: { deletedAt: null, ...scope },
    },
    orderBy: [{ concluida: 'asc' }, { prioridade: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    select: {
      id: true,
      titulo: true,
      descricao: true,
      prioridade: true,
      concluida: true,
      concluidaEm: true,
      createdAt: true,
      inquerito: { select: { nuipc: true, natureza: true, cartaPrecatoria: true } },
    },
  })

  const tarefas: TarefaBrowserItem[] = rows.map((t) => ({
    id: t.id,
    titulo: t.titulo,
    descricao: t.descricao,
    prioridade: t.prioridade,
    concluida: t.concluida,
    concluidaEm: t.concluidaEm?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    inquerito: {
      nuipc: t.inquerito.nuipc,
      slug: nuipcToSlug(t.inquerito.nuipc),
      natureza: t.inquerito.natureza,
      cartaPrecatoria: t.inquerito.cartaPrecatoria,
    },
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Tarefas</h1>
          <p className="text-muted-foreground text-sm">
            As suas tarefas pessoais, por inquérito.
          </p>
        </div>
        <HelpButton title="Ajuda — Tarefas" className="shrink-0">
          <HelpSection title="O que são as tarefas">
            <p>As tarefas são pessoais — só você as vê. Cada tarefa pertence a um inquérito e pode ter uma prioridade (Alta, Normal, Baixa) e uma descrição com Markdown.</p>
          </HelpSection>
          <HelpSection title="Filtros">
            <p>Use os botões <strong>Pendentes / Concluídas / Todas</strong> e o filtro de prioridade para focar no que importa. A pesquisa filtra por título, NUIPC ou descrição.</p>
          </HelpSection>
          <HelpSection title="Marcar como concluída">
            <p>Clique no círculo à esquerda de qualquer tarefa para a marcar como concluída (ou reabrir). A alteração é imediata.</p>
          </HelpSection>
          <HelpSection title="Criar tarefas">
            <p>As tarefas são criadas na secção <strong>Tarefas</strong> do detalhe de cada inquérito. Clique em <strong>Abrir</strong> para ir ao inquérito.</p>
          </HelpSection>
        </HelpButton>
      </div>

      <TarefasBrowser tarefas={tarefas} />
    </div>
  )
}
