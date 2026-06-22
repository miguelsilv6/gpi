import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere, getInqueritoColumnsVisibility } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { InqueritoTable } from '@/components/inqueritos/inquerito-table'
import { ChevronLeft, MonitorCog } from 'lucide-react'
import Link from 'next/link'
import type { Role } from '@/generated/prisma/enums'

/**
 * Drill-down view for the "Aguarda Exames" dashboard counter — lists active
 * inquéritos with at least one unresolved atividade whose padrão has
 * categoriaDashboard='AGUARDA_EXAMES'. No filter UI; the inquéritos listing
 * (/inqueritos) is the full-fledged search page.
 */
export default async function AguardaExamesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = session.user.role as Role

  const where = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)

  // Resolve which padrão names mark "aguarda exames" (set in /configurações).
  const padroes = await prisma.atividadePadrao.findMany({
    where: { ativa: true, categoriaDashboard: 'AGUARDA_EXAMES' },
    select: { nome: true },
  })
  const nomes = padroes.map((p) => p.nome)

  const showBrigada = hasPermission(role, 'inquerito:read:all')
  const { showInspetor, showDenunciante, showPrazo } = getInqueritoColumnsVisibility(role)

  const inqueritos = nomes.length === 0
    ? []
    : await prisma.inquerito.findMany({
        where: {
          ...where,
          deletedAt: null,
          estado: { terminal: false },
          atividades: {
            some: { descricao: { in: nomes }, concluidaEm: null },
          },
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          estado: { select: { id: true, codigo: true, nome: true, cor: true, terminal: true, ativo: true } },
          crime: { select: { id: true, nome: true } },
          brigada: { select: { id: true, nome: true } },
          inspetor: { select: { id: true, nome: true } },
          _count: { select: { atividades: true } },
        },
      })

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ChevronLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <MonitorCog className="h-5 w-5 text-purple-500" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aguarda Exames</h1>
          <p className="text-muted-foreground text-sm">
            {inqueritos.length} inquérito{inqueritos.length === 1 ? '' : 's'} com atividades
            por concluir.
          </p>
        </div>
      </div>

      {nomes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma atividade-padrão está marcada como{' '}
          <strong className="text-foreground">Aguarda exames</strong>. Edite uma em{' '}
          <Link href="/configuracoes" className="text-blue-600 hover:underline">
            Configurações → Atividades
          </Link>{' '}
          e atribua-lhe a categoria <em>Aguarda exames</em>.
        </div>
      ) : (
        <InqueritoTable
          inqueritos={inqueritos}
          canBulk={false}
          canTransfer={false}
          showBrigada={showBrigada}
          showInspetor={showInspetor}
          showDenunciante={showDenunciante}
          showPrazo={showPrazo}
          inspetores={[]}
          brigadas={[]}
          estados={[]}
        />
      )}
    </div>
  )
}
