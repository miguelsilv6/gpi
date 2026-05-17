import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buildInqueritoWhere } from '@/lib/auth-helpers'
import { ROLE_LABELS } from '@/lib/rbac'
import { FASE_LABELS } from '@/lib/constants'
import type { Role } from '@/generated/prisma/enums'
import {
  FolderOpen,
  Clock,
  CheckCircle,
  AlertTriangle,
  Activity,
} from 'lucide-react'
import { formatDate, nuipcToSlug } from '@/lib/utils'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  const where = buildInqueritoWhere(role, session.user.id, session.user.brigadaId)
  const now = new Date()

  const [total, emInvestigacao, vencidos, recentes] = await Promise.all([
    prisma.inquerito.count({ where: { ...where, deletedAt: null } }),
    prisma.inquerito.count({
      where: { ...where, deletedAt: null, estado: { codigo: 'EM_INVESTIGACAO' } },
    }),
    prisma.inquerito.count({
      where: {
        ...where,
        deletedAt: null,
        dataPrazo: { lt: now },
        estado: { terminal: false },
      },
    }),
    prisma.inquerito.findMany({
      where: { ...where, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        brigada: { select: { nome: true } },
        inspetor: { select: { nome: true } },
        estado: { select: { codigo: true, nome: true, cor: true } },
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

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground mt-1">Inquéritos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Em Investigação</CardTitle>
            <Activity className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{emInvestigacao}</p>
            <p className="text-xs text-muted-foreground mt-1">Ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Vencidos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{vencidos}</p>
            <p className="text-xs text-muted-foreground mt-1">Prazo ultrapassado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Sem prazo</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{Math.max(0, total - emInvestigacao - vencidos)}</p>
            <p className="text-xs text-muted-foreground mt-1">Outros estados</p>
          </CardContent>
        </Card>
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
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{inq.natureza}</p>
                    {inq.inspetor && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {inq.inspetor.nome}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {inq.estado.nome}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {FASE_LABELS[inq.faseProcessual]}
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
