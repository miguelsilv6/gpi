import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { hasPermission } from '@/lib/rbac'
import { listRelatorios } from '@/lib/relatorios'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowRight } from 'lucide-react'
import { AccessDenied } from '@/components/access-denied'
import type { Role } from '@/generated/prisma/enums'

export default async function RelatoriosIndexPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'relatorio:read')) {
    return <AccessDenied message="Não dispões de privilégios para ver relatórios." />
  }

  const relatorios = listRelatorios()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground text-sm">
          Consultar e exportar relatórios operacionais (CSV, Markdown, PDF).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {relatorios.map((r) => {
          const Icon = r.icon
          return (
            <Card key={r.id} className="flex flex-col">
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <div className="rounded-md bg-accent p-2">
                  <Icon className="h-5 w-5 text-accent-foreground" />
                </div>
                <CardTitle className="text-base leading-tight pt-1">
                  {r.titulo}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 justify-between gap-4">
                <p className="text-sm text-muted-foreground">{r.descricao}</p>
                <Link
                  href={`/relatorios/${r.id}`}
                  className={cn(buttonVariants({ size: 'sm' }), 'self-start')}
                >
                  Abrir <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
