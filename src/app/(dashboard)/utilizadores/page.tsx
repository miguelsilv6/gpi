import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/rbac'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil } from 'lucide-react'
import Link from 'next/link'
import { cn, iconButtonClasses, formatDateTime } from '@/lib/utils'
import { AccessDenied } from '@/components/access-denied'
import { Suspense } from 'react'
import { UtilizadoresFilters } from '@/components/utilizadores/utilizadores-filters'
import type { Role } from '@/generated/prisma/enums'

interface PageProps {
  searchParams: Promise<{ search?: string; role?: string; ativo?: string }>
}

export default async function UtilizadoresPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'utilizador:manage')) {
    return <AccessDenied message="Não dispões de privilégios para gerir utilizadores." />
  }

  const { search, role: roleFilter, ativo } = await searchParams

  const utilizadores = await prisma.utilizador.findMany({
    where: {
      ...(search && {
        OR: [
          { nome: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(roleFilter && { role: roleFilter as Role }),
      ...(ativo !== undefined && { ativo: ativo === 'true' }),
    },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    select: {
      id: true,
      nome: true,
      email: true,
      role: true,
      ativo: true,
      brigada: { select: { nome: true } },
      createdAt: true,
      lastLoginAt: true,
      lastLoginIp: true,
      lastSeenAt: true,
    },
  })

  // "Online agora": as sessões são JWT (sem registo em BD), por isso derivamos
  // a presença de um heartbeat de atividade — o sino sonda /api/notificacoes a
  // cada ~90s e actualiza lastSeenAt. Consideramos online quem foi visto nos
  // últimos ~3 min (tolera até 2 sondagens falhadas).
  const ONLINE_WINDOW_MS = 3 * 60 * 1000
  const now = Date.now()
  const isOnline = (u: { lastSeenAt: Date | null }) =>
    !!u.lastSeenAt && now - u.lastSeenAt.getTime() < ONLINE_WINDOW_MS

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Utilizadores</h1>
          <p className="text-muted-foreground text-sm">{utilizadores.length} utilizador{utilizadores.length !== 1 ? 'es' : ''}</p>
        </div>
        <Button size="sm">
          <Link href="/utilizadores/novo" className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Novo
          </Link>
        </Button>
      </div>

      <Suspense>
        <UtilizadoresFilters />
      </Suspense>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nome</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Perfil</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Brigada</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Último acesso</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {utilizadores.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  Nenhum utilizador encontrado
                </td>
              </tr>
            ) : utilizadores.map((u) => (
              <tr key={u.id} className={cn('hover:bg-accent/30 transition-colors', !u.ativo && 'opacity-50')}>
                <td className="px-4 py-3 font-medium">
                  <span className="flex items-center gap-2">
                    {isOnline(u) && (
                      <span
                        className="inline-block h-2 w-2 rounded-full bg-green-500 shrink-0"
                        title="Ativo agora (visto nos últimos minutos)"
                        aria-label="Online agora"
                        role="img"
                      />
                    )}
                    {u.nome}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_COLORS[u.role as Role])}>
                    {ROLE_LABELS[u.role as Role]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {u.brigada?.nome ?? <span className="italic">—</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {u.lastLoginAt ? (
                    <div>
                      <div className="whitespace-nowrap">
                        {formatDateTime(u.lastLoginAt)}
                        {isOnline(u) && (
                          <span className="text-green-600 dark:text-green-400"> · online</span>
                        )}
                      </div>
                      {u.lastLoginIp && (
                        <div className="text-xs font-mono text-muted-foreground/80">{u.lastLoginIp}</div>
                      )}
                    </div>
                  ) : (
                    <span className="italic">Nunca</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.ativo ? 'default' : 'outline'} className="text-xs">
                    {u.ativo ? 'Activo' : 'Inactivo'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/utilizadores/${u.id}/editar`}
                    className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                    aria-label={`Editar ${u.nome}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {utilizadores.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">Nenhum utilizador encontrado</p>
        ) : utilizadores.map((u) => (
          <div
            key={u.id}
            className={cn(
              'rounded-xl border bg-card p-4 flex items-start justify-between gap-3',
              !u.ativo && 'opacity-50',
            )}
          >
            <div className="min-w-0">
              <p className="font-medium truncate flex items-center gap-2">
                {isOnline(u) && (
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-green-500 shrink-0"
                    title="Ativo agora (visto nos últimos minutos)"
                    aria-label="Online agora"
                    role="img"
                  />
                )}
                <span className="truncate">{u.nome}</span>
              </p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_COLORS[u.role as Role])}>
                  {ROLE_LABELS[u.role as Role]}
                </span>
                {u.brigada && (
                  <span className="text-xs text-muted-foreground">{u.brigada.nome}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {u.lastLoginAt ? (
                  <>
                    Último acesso: {formatDateTime(u.lastLoginAt)}
                    {isOnline(u) && (
                      <span className="text-green-600 dark:text-green-400"> · online</span>
                    )}
                    {u.lastLoginIp && <span className="font-mono"> · {u.lastLoginIp}</span>}
                  </>
                ) : (
                  <span className="italic">Nunca acedeu</span>
                )}
              </p>
            </div>
            <Link
              href={`/utilizadores/${u.id}/editar`}
              className={cn(iconButtonClasses, 'text-muted-foreground shrink-0')}
              aria-label={`Editar ${u.nome}`}
            >
              <Pencil className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
