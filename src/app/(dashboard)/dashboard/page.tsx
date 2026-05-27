import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buildInqueritoWhere } from '@/lib/auth-helpers'
import { ROLE_LABELS } from '@/lib/rbac'
import type { Role } from '@/generated/prisma/enums'
import { FolderOpen, Activity, MonitorCog, Send } from 'lucide-react'
import { formatDate, nuipcToSlug } from '@/lib/utils'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  const where = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)

  // Padrões com categoria de dashboard — agrupados por categoria. O link
  // Atividade↔Padrão é feito por nome (consistente com `contaParaEstatistica`).
  const padroes = await prisma.atividadePadrao.findMany({
    where: { ativa: true, categoriaDashboard: { not: null } },
    select: { nome: true, categoriaDashboard: true },
  })
  const nomesAguardaExames = padroes
    .filter((p) => p.categoriaDashboard === 'AGUARDA_EXAMES')
    .map((p) => p.nome)
  const nomesEnviados = padroes
    .filter((p) => p.categoriaDashboard === 'ENVIADO')
    .map((p) => p.nome)

  // Base where: apenas inquéritos activos (excluindo terminal/eliminados).
  const baseWhere = {
    ...where,
    deletedAt: null,
    estado: { terminal: false },
  }

  const [total, emInvestigacao, aguardaExames, enviados, recentes] = await Promise.all([
    prisma.inquerito.count({ where: baseWhere }),
    prisma.inquerito.count({
      where: { ...baseWhere, estado: { codigo: 'EM_INVESTIGACAO' } },
    }),
    nomesAguardaExames.length === 0
      ? Promise.resolve(0)
      : prisma.inquerito.count({
          where: {
            ...baseWhere,
            atividades: {
              some: { descricao: { in: nomesAguardaExames }, concluidaEm: null },
            },
          },
        }),
    nomesEnviados.length === 0
      ? Promise.resolve(0)
      : prisma.inquerito.count({
          where: {
            ...baseWhere,
            atividades: {
              some: { descricao: { in: nomesEnviados }, concluidaEm: null },
            },
          },
        }),
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
          Bem-vindo, {session.user.nome} ·{' '}
          <span className="font-medium">{ROLE_LABELS[role]}</span>
        </p>
      </div>

      {/* Stats cards — every card is a Link so operators can drill into the
          filtered listing. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Link href="/inqueritos" className="block">
          <Card className="transition-colors hover:bg-accent/30 cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{total}</p>
              <p className="text-xs text-muted-foreground mt-1">Inquéritos ativos</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/inqueritos?estado=EM_INVESTIGACAO" className="block">
          <Card className="transition-colors hover:bg-accent/30 cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">Em Investigação</CardTitle>
              <Activity className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-yellow-600">{emInvestigacao}</p>
              <p className="text-xs text-muted-foreground mt-1">Ativos</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/inqueritos/aguarda-exames" className="block">
          <Card className="transition-colors hover:bg-accent/30 cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">Aguarda Exames</CardTitle>
              <MonitorCog className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-purple-700">{aguardaExames}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {nomesAguardaExames.length === 0 ? 'Configurar em /configurações' : 'Por concluir'}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/inqueritos/enviados" className="block">
          <Card className="transition-colors hover:bg-accent/30 cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">Enviados</CardTitle>
              <Send className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-700">{enviados}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {nomesEnviados.length === 0 ? 'Configurar em /configurações' : 'Por concluir'}
              </p>
            </CardContent>
          </Card>
        </Link>
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
