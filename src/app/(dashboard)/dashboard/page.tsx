import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buildInqueritoWhere } from '@/lib/auth-helpers'
import { hasPermission, ROLE_LABELS } from '@/lib/rbac'
import { getInqueritoCounters } from '@/lib/estatisticas-counters'
import type { Role } from '@/generated/prisma/enums'
import {
  FolderOpen,
  Activity,
  MonitorCog,
  Send,
  FileText,
  Mail,
  Users,
  Share2,
  Archive,
  type LucideIcon,
} from 'lucide-react'
import { formatDate, nuipcToSlug } from '@/lib/utils'
import Link from 'next/link'

interface StatCard {
  label: string
  value: number
  icon: LucideIcon
  iconClass: string
  valueClass?: string
  href?: string
  note?: string
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  const where = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)
  // Chefe e superiores (quem pode ver estatísticas) veem o mesmo conjunto de 8
  // contadores da página de Estatísticas; o INSPETOR mantém os 4 essenciais.
  const chefePlus = hasPermission(role, 'estatistica:read')

  // Base: inquéritos ativos (não-terminal, não-eliminados) — usado nos cartões
  // simples do inspetor e na lista de recentes.
  const baseWhere = {
    ...where,
    deletedAt: null,
    estado: { terminal: false },
  }

  async function buildCards(): Promise<StatCard[]> {
    if (chefePlus) {
      // Âmbito por role, sem filtro de datas — "Total" conta tudo (igual às
      // Estatísticas), com Ativos/Arquivados/Distribuídos em separado.
      const scopeWhere = { ...where, deletedAt: null }
      const c = await getInqueritoCounters(scopeWhere, scopeWhere)
      return [
        { label: 'Total', value: c.total, icon: FileText, iconClass: 'text-muted-foreground', href: '/inqueritos', note: 'Todos' },
        { label: 'C. Precatórias', value: c.cartaPrecatoria, icon: Mail, iconClass: 'text-orange-500', valueClass: 'text-orange-600 dark:text-orange-400' },
        { label: 'Ativos', value: c.ativos, icon: Activity, iconClass: 'text-green-500', valueClass: 'text-green-700 dark:text-green-400' },
        { label: 'Sem inspetor', value: c.semInspetor, icon: Users, iconClass: 'text-muted-foreground', href: '/inqueritos?semInspetor=1' },
        { label: 'Distribuídos', value: c.distribuido, icon: Share2, iconClass: 'text-purple-500', valueClass: 'text-purple-700 dark:text-purple-400', href: '/inqueritos?estado=DISTRIBUIDO' },
        { label: 'Aguarda Exames', value: c.aguardaExames, icon: MonitorCog, iconClass: 'text-purple-500', valueClass: 'text-purple-700 dark:text-purple-400', href: '/inqueritos/pedidos-exame' },
        { label: 'Enviados', value: c.enviados, icon: Send, iconClass: 'text-blue-500', valueClass: 'text-blue-700 dark:text-blue-400', href: '/inqueritos/enviados' },
        { label: 'Arquivados', value: c.arquivados, icon: Archive, iconClass: 'text-gray-500', valueClass: 'text-gray-600 dark:text-gray-400', href: '/inqueritos?estado=ARQUIVADO' },
      ]
    }

    // INSPETOR — 4 cartões essenciais (sobre inquéritos ativos).
    const padroes = await prisma.atividadePadrao.findMany({
      where: { ativa: true, categoriaDashboard: { not: null } },
      select: { nome: true, categoriaDashboard: true },
    })
    const nomesAguardaExames = padroes.filter((p) => p.categoriaDashboard === 'AGUARDA_EXAMES').map((p) => p.nome)
    const nomesEnviados = padroes.filter((p) => p.categoriaDashboard === 'ENVIADO').map((p) => p.nome)

    const [total, emInvestigacao, aguardaExames, enviados] = await Promise.all([
      prisma.inquerito.count({ where: baseWhere }),
      prisma.inquerito.count({ where: { ...baseWhere, estado: { codigo: 'EM_INVESTIGACAO' } } }),
      nomesAguardaExames.length === 0
        ? Promise.resolve(0)
        : prisma.inquerito.count({
            where: { ...baseWhere, atividades: { some: { descricao: { in: nomesAguardaExames }, concluidaEm: null } } },
          }),
      nomesEnviados.length === 0
        ? Promise.resolve(0)
        : prisma.inquerito.count({
            where: { ...baseWhere, atividades: { some: { descricao: { in: nomesEnviados }, concluidaEm: null } } },
          }),
    ])
    return [
      { label: 'Total', value: total, icon: FolderOpen, iconClass: 'text-muted-foreground', href: '/inqueritos', note: 'Inquéritos ativos' },
      { label: 'Em Investigação', value: emInvestigacao, icon: Activity, iconClass: 'text-yellow-500', valueClass: 'text-yellow-600 dark:text-yellow-400', href: '/inqueritos?estado=EM_INVESTIGACAO', note: 'Ativos' },
      { label: 'Aguarda Exames', value: aguardaExames, icon: MonitorCog, iconClass: 'text-purple-500', valueClass: 'text-purple-700 dark:text-purple-400', href: '/inqueritos/pedidos-exame', note: nomesAguardaExames.length === 0 ? 'Configurar em /configurações' : 'Por concluir' },
      { label: 'Enviados', value: enviados, icon: Send, iconClass: 'text-blue-500', valueClass: 'text-blue-700 dark:text-blue-400', href: '/inqueritos/enviados', note: nomesEnviados.length === 0 ? 'Configurar em /configurações' : 'Por concluir' },
    ]
  }

  const [cards, recentes] = await Promise.all([
    buildCards(),
    prisma.inquerito.findMany({
      where: baseWhere,
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        brigada: { select: { nome: true } },
        inspetor: { select: { nome: true } },
        estado: { select: { codigo: true, nome: true, cor: true } },
        crime: { select: { nome: true } },
      },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Bem-vindo <span className="font-medium">{ROLE_LABELS[role]}</span> {session.user.nome}
        </p>
      </div>

      {/* Stats cards — os que têm filtro associado são links para a listagem. */}
      <div className={`grid grid-cols-2 gap-3 md:gap-4 ${chefePlus ? 'md:grid-cols-4 xl:grid-cols-8' : 'md:grid-cols-4'}`}>
        {cards.map((card) => {
          const Icon = card.icon
          const inner = (
            <Card className={card.href ? 'transition-colors hover:bg-accent/30 cursor-pointer h-full' : 'h-full'}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">{card.label}</CardTitle>
                <Icon className={`h-4 w-4 ${card.iconClass}`} />
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${card.valueClass ?? ''}`}>{card.value}</p>
                {card.note && <p className="text-xs text-muted-foreground mt-1">{card.note}</p>}
              </CardContent>
            </Card>
          )
          return card.href ? (
            <Link key={card.label} href={card.href} className="block h-full">
              {inner}
            </Link>
          ) : (
            <div key={card.label} className="h-full">{inner}</div>
          )
        })}
      </div>

      {/* Recent inquiries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inquéritos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sem inquéritos para mostrar.
            </p>
          ) : (
            <div className="space-y-3">
              {recentes.map((inq) => (
                <Link
                  key={inq.id}
                  href={`/inqueritos/${nuipcToSlug(inq.nuipc)}`}
                  className="flex items-start justify-between p-3 rounded-lg border hover:bg-accent transition-colors gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium truncate">{inq.nuipc}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {inq.crime?.nome ?? inq.natureza}
                    </p>
                    {role === 'INSPETOR'
                      ? inq.denuncianteNome && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Denunciante: {inq.denuncianteNome}
                          </p>
                        )
                      : inq.inspetor && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {inq.inspetor.nome}
                          </p>
                        )
                    }
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {inq.estado.nome}
                    </Badge>
                    {inq.dataPrazo && (
                      <span className="text-[10px] text-muted-foreground">
                        Prazo: {formatDate(inq.dataPrazo)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
          <div className="mt-4">
            <Link
              href="/inqueritos"
              className="text-sm text-blue-600 hover:underline"
            >
              Ver todos os inquéritos →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
