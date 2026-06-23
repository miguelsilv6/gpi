import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere, getInqueritoColumnsVisibility } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { InqueritoTable } from '@/components/inqueritos/inquerito-table'
import { cn } from '@/lib/utils'
import { ChevronLeft, MonitorCog } from 'lucide-react'
import Link from 'next/link'
import type { Role } from '@/generated/prisma/enums'

/**
 * Lista todos os inquéritos com pedidos de exame (atividades cujo padrão tem
 * categoriaDashboard='AGUARDA_EXAMES'). Por predefinição mostra os exames por
 * concluir; o separador "Concluídos" mostra os já confirmados — sem restringir
 * por estado terminal, porque um exame pode ter sido concluído já depois de o
 * inquérito ter avançado para um estado terminal.
 */
export default async function PedidosExamePage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = session.user.role as Role

  const { estado: estadoParam } = await searchParams
  const concluidos = estadoParam === 'concluidos'

  const where = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)

  // Não filtramos por `ativa` — uma atividade pendente cujo padrão foi
  // desativado depois de criada continua por concluir e não deve desaparecer
  // desta listagem nem do contador do dashboard.
  const padroes = await prisma.atividadePadrao.findMany({
    where: { categoriaDashboard: 'AGUARDA_EXAMES' },
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
          ...(concluidos ? {} : { estado: { terminal: false } }),
          atividades: {
            some: concluidos
              ? { descricao: { in: nomes }, concluidaEm: { not: null } }
              : { descricao: { in: nomes }, concluidaEm: null },
          },
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          estado: { select: { id: true, codigo: true, nome: true, cor: true, terminal: true, ativo: true } },
          crime: { select: { id: true, nome: true } },
          brigada: { select: { id: true, nome: true } },
          inspetor: { select: { id: true, nome: true } },
          etiquetas: { select: { id: true, nome: true }, orderBy: { nome: 'asc' } },
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
          <h1 className="text-2xl font-bold tracking-tight">Pedidos de Exame</h1>
          <p className="text-muted-foreground text-sm">
            {inqueritos.length} inquérito{inqueritos.length === 1 ? '' : 's'} com exames{' '}
            {concluidos ? 'concluídos.' : 'por concluir.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b">
        <Link
          href="/inqueritos/pedidos-exame"
          className={cn(
            'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            !concluidos
              ? 'border-purple-500 text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          Por concluir
        </Link>
        <Link
          href="/inqueritos/pedidos-exame?estado=concluidos"
          className={cn(
            'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            concluidos
              ? 'border-purple-500 text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          Concluídos
        </Link>
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
