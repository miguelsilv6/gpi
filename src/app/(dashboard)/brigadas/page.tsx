import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/rbac'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Users, FileText, Pencil } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import { BrigadasFilters } from '@/components/brigadas/brigadas-filters'
import type { Role } from '@/generated/prisma/enums'

interface PageProps {
  searchParams: Promise<{ search?: string; ativa?: string }>
}

export default async function BrigadasPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'brigada:read')) redirect('/dashboard')

  const canManage = hasPermission(role, 'brigada:manage')

  const { search, ativa } = await searchParams

  const brigadas = await prisma.brigada.findMany({
    where: {
      ...(search && { nome: { contains: search, mode: 'insensitive' } }),
      ...(ativa !== undefined && { ativa: ativa === 'true' }),
    },
    orderBy: { nome: 'asc' },
    include: {
      utilizadores: {
        where: { ativo: true },
        select: { id: true, nome: true, role: true },
      },
      // Excluir soft-deleted para o counter alinhar com a listagem
      // /inqueritos (que sempre filtra deletedAt: null).
      _count: { select: { inqueritos: { where: { deletedAt: null } } } },
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Brigadas</h1>
          <p className="text-muted-foreground text-sm">{brigadas.length} brigada{brigadas.length !== 1 ? 's' : ''}</p>
        </div>
        {canManage && (
          <Button size="sm">
            <Link href="/brigadas/nova" className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              Nova Brigada
            </Link>
          </Button>
        )}
      </div>

      <Suspense>
        <BrigadasFilters />
      </Suspense>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {brigadas.map((brigada) => {
          const chefe = brigada.utilizadores.find((m) => m.role === 'INSPETOR_CHEFE')
          const inspetores = brigada.utilizadores.filter((m) => m.role === 'INSPETOR')
          return (
            <Card key={brigada.id} className={!brigada.ativa ? 'opacity-60' : undefined}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{brigada.nome}</CardTitle>
                  <div className="flex items-center gap-1 shrink-0">
                    {!brigada.ativa && (
                      <Badge variant="outline" className="text-xs">Inativa</Badge>
                    )}
                    {canManage && (
                      <Link
                        href={`/brigadas/${brigada.id}/editar`}
                        className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
                {brigada.descricao && (
                  <p className="text-xs text-muted-foreground">{brigada.descricao}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{brigada.utilizadores.length} membro{brigada.utilizadores.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{brigada._count.inqueritos} inquérito{brigada._count.inqueritos !== 1 ? 's' : ''}</span>
                </div>
                {chefe && (
                  <div className="pt-1 border-t">
                    <p className="text-xs text-muted-foreground">Chefe</p>
                    <p className="font-medium">{chefe.nome}</p>
                  </div>
                )}
                {inspetores.length > 0 && (
                  <div className="pt-1 border-t">
                    <p className="text-xs text-muted-foreground mb-1">Inspetores</p>
                    <div className="flex flex-wrap gap-1">
                      {inspetores.map((i) => (
                        <span key={i.id} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                          {i.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {brigadas.length === 0 && (
        <p className="text-center text-muted-foreground py-12">Nenhuma brigada encontrada.</p>
      )}
    </div>
  )
}
