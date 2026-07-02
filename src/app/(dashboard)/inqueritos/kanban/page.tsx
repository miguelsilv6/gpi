import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { listEstados } from '@/lib/estados'
import { getInqueritoColumnsVisibility } from '@/lib/role-scope'
import { nuipcToSlug } from '@/lib/utils'
import { KanbanBoard, type KanbanColuna } from '@/components/inqueritos/kanban-board'
import { Button } from '@/components/ui/button'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { List } from 'lucide-react'
import type { Role } from '@/generated/prisma/enums'

const CARDS_POR_COLUNA = 40

/**
 * Vista Kanban dos inquéritos — colunas pelos estados ativos, no âmbito de
 * leitura de cada perfil. Arrastar (mudar de estado) exige permissão bulk —
 * chefe move a sua brigada, coordenador/administração movem tudo; o inspetor
 * consulta em leitura.
 */
export default async function KanbanPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  const roleWhere = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)
  const canDrag = hasPermission(role, 'inquerito:bulk:brigade') || hasPermission(role, 'inquerito:bulk:all')
  const { showInspetor } = getInqueritoColumnsVisibility(role)

  const estados = await listEstados({ onlyActive: true })

  const [porEstado, inqueritos] = await Promise.all([
    prisma.inquerito.groupBy({
      by: ['estadoId'],
      where: { deletedAt: null, ...roleWhere },
      _count: true,
    }),
    prisma.inquerito.findMany({
      where: { deletedAt: null, ...roleWhere },
      orderBy: { updatedAt: 'desc' },
      // Busca-se por estado no passo seguinte; aqui limita-se o total para não
      // rebentar com bases grandes (cap por coluna aplicado em memória).
      take: CARDS_POR_COLUNA * Math.max(estados.length, 1),
      select: {
        id: true,
        nuipc: true,
        natureza: true,
        estadoId: true,
        dataPrazo: true,
        crime: { select: { nome: true } },
        inspetor: { select: { nome: true } },
        brigada: { select: { nome: true } },
      },
    }),
  ])

  const countByEstado = new Map(porEstado.map((r) => [r.estadoId, r._count]))
  const colunas: KanbanColuna[] = estados.map((e) => {
    const cards = inqueritos
      .filter((i) => i.estadoId === e.id)
      .slice(0, CARDS_POR_COLUNA)
      .map((i) => ({
        id: i.id,
        nuipc: i.nuipc,
        slug: nuipcToSlug(i.nuipc),
        crimeNome: i.crime?.nome ?? i.natureza,
        inspetorNome: i.inspetor?.nome ?? null,
        brigadaNome: i.brigada?.nome ?? null,
        dataPrazo: i.dataPrazo ? i.dataPrazo.toISOString() : null,
      }))
    return {
      estadoId: e.id,
      codigo: e.codigo,
      nome: e.nome,
      cor: e.cor ?? null,
      terminal: e.terminal,
      total: countByEstado.get(e.id) ?? 0,
      cards,
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Inquéritos — Kanban</h1>
          <HelpButton title="Ajuda — Kanban" className="shrink-0">
            <HelpSection title="O que é">
              <p>Vista de fluxo: uma coluna por estado, com os inquéritos mais recentes de cada um (máx. {CARDS_POR_COLUNA} por coluna).</p>
            </HelpSection>
            <HelpSection title="Mudar de estado">
              <p>Arraste um cartão para outra coluna. Disponível para Inspetor-Chefe (brigada), Coordenador e Administração; as mudanças ficam no histórico do inquérito.</p>
              <p>Colunas de estados terminais (com cadeado) não recebem cartões — concluir/arquivar exige data de conclusão, no formulário de edição. Reabrir um inquérito terminal faz-se no detalhe, com motivo.</p>
            </HelpSection>
          </HelpButton>
        </div>
        <Button size="sm" variant="outline">
          <Link href="/inqueritos" className="flex items-center gap-1.5">
            <List className="h-4 w-4" />
            Vista de lista
          </Link>
        </Button>
      </div>

      <KanbanBoard colunas={colunas} canDrag={canDrag} showInspetor={showInspetor} />
    </div>
  )
}
