import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/rbac'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil } from 'lucide-react'
import Link from 'next/link'
import { cn, iconButtonClasses } from '@/lib/utils'
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
  if (!hasPermission(role, 'utilizador:manage')) redirect('/dashboard')

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
    },
  })

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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {utilizadores.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  Nenhum utilizador encontrado
                </td>
              </tr>
            ) : utilizadores.map((u) => (
              <tr key={u.id} className={cn('hover:bg-accent/30 transition-colors', !u.ativo && 'opacity-50')}>
                <td className="px-4 py-3 font-medium">{u.nome}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_COLORS[u.role as Role])}>
                    {ROLE_LABELS[u.role as Role]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {u.brigada?.nome ?? <span className="italic">—</span>}
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
              <p className="font-medium truncate">{u.nome}</p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_COLORS[u.role as Role])}>
                  {ROLE_LABELS[u.role as Role]}
                </span>
                {u.brigada && (
                  <span className="text-xs text-muted-foreground">{u.brigada.nome}</span>
                )}
              </div>
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
