import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere } from '@/lib/role-scope'
import { hasPermission } from '@/lib/rbac'
import { AccessDenied } from '@/components/access-denied'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { NotasBrowser, type NotaBrowserItem } from '@/components/notas/notas-browser'
import { nuipcToSlug } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

// Limite defensivo: a página mostra as notas mais recentes a que o utilizador
// tem acesso; a pesquisa filtra do lado do cliente sobre este conjunto.
const MAX_NOTAS = 300

export const dynamic = 'force-dynamic'

export default async function NotasPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  // Mesma porta de leitura dos inquéritos: quem não pode ler inquéritos não
  // tem por onde ver notas.
  const canRead =
    hasPermission(role, 'inquerito:read:own') ||
    hasPermission(role, 'inquerito:read:brigade') ||
    hasPermission(role, 'inquerito:read:all')
  if (!canRead) {
    return <AccessDenied message="Não dispões de privilégios para ver as notas de inquérito." />
  }

  const scope = buildInqueritoWhere(role, session.user.id, session.user.brigadaId ?? null)

  const [total, rows] = await Promise.all([
    prisma.notaInquerito.count({
      where: { inquerito: { deletedAt: null, ...scope } },
    }),
    prisma.notaInquerito.findMany({
      where: { inquerito: { deletedAt: null, ...scope } },
      orderBy: { updatedAt: 'desc' },
      take: MAX_NOTAS,
      select: {
        id: true,
        titulo: true,
        conteudo: true,
        createdAt: true,
        updatedAt: true,
        autor: { select: { nome: true } },
        editadoPor: { select: { nome: true } },
        inquerito: { select: { nuipc: true, natureza: true } },
      },
    }),
  ])

  const notas: NotaBrowserItem[] = rows.map((n) => ({
    id: n.id,
    titulo: n.titulo,
    conteudo: n.conteudo,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    autorNome: n.autor.nome,
    editadoPorNome: n.editadoPor?.nome ?? null,
    inquerito: {
      nuipc: n.inquerito.nuipc,
      slug: nuipcToSlug(n.inquerito.nuipc),
      natureza: n.inquerito.natureza,
    },
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Notas</h1>
          <p className="text-muted-foreground text-sm">
            Consulte as notas de investigação agrupadas por inquérito.
          </p>
        </div>
        <HelpButton title="Ajuda — Notas" className="shrink-0">
          <HelpSection title="O que vê aqui">
            <p>Esta página reúne todas as notas de investigação a que tem acesso, agrupadas por inquérito e ordenadas pela última atualização. O acesso respeita as mesmas regras dos inquéritos (inspetor vê as suas, chefe vê as da brigada).</p>
          </HelpSection>
          <HelpSection title="Pesquisar">
            <p>Use a caixa de pesquisa para filtrar por conteúdo, título, NUIPC ou autor. Clique em <strong>Abrir</strong> num inquérito para ir ao seu detalhe e editar as notas.</p>
          </HelpSection>
          <HelpSection title="Criar e editar notas">
            <p>As notas são criadas e editadas na página de cada inquérito, na secção <strong>Notas de investigação</strong>, com um editor estilo Notion (formatação, blocos via &quot;/&quot; e Markdown).</p>
          </HelpSection>
        </HelpButton>
      </div>

      <NotasBrowser notas={notas} total={total} truncated={total > rows.length} />
    </div>
  )
}
