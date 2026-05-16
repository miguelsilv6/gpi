import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { hasPermission } from '@/lib/rbac'
import { InqueritoForm } from '@/components/inqueritos/inquerito-form'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import type { Role } from '@/generated/prisma/enums'

export default async function NovoInqueritoPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'inquerito:create')) redirect('/inqueritos')

  const [brigadas, inspetores] = await Promise.all([
    prisma.brigada.findMany({
      where: { ativa: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    }),
    prisma.utilizador.findMany({
      where: { role: 'INSPETOR', ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, brigadaId: true },
    }),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/inqueritos"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Inquéritos
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Novo Inquérito</h1>
        <p className="text-muted-foreground text-sm">Preencha os dados do novo inquérito</p>
      </div>

      <InqueritoForm
        mode="create"
        brigadas={brigadas}
        inspetores={inspetores}
        defaultValues={
          session.user.brigadaId ? { brigadaId: session.user.brigadaId } : undefined
        }
      />
    </div>
  )
}
