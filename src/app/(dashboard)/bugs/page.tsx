import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { hasPermission } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { AccessDenied } from '@/components/access-denied'
import { BugReportsAdmin } from '@/components/bug-reports/bug-reports-admin'
import type { Role } from '@/generated/prisma/enums'

const PAGE_SIZE = 30

export default async function BugsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = session.user.role as Role
  if (!hasPermission(role, 'bugreport:manage')) {
    return <AccessDenied message="Não dispões de privilégios para gerir bug reports." />
  }

  const rows = await prisma.bugReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    include: { criadoPor: { select: { id: true, nome: true, email: true } } },
  })
  const hasMore = rows.length > PAGE_SIZE
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const nextCursor = hasMore ? items[items.length - 1].id : null

  // Contagem por estado para os totais no topo.
  const grouped = await prisma.bugReport.groupBy({
    by: ['estado'],
    _count: { _all: true },
  })
  const counts = Object.fromEntries(grouped.map((g) => [g.estado, g._count._all]))

  return (
    <BugReportsAdmin
      initialItems={JSON.parse(JSON.stringify(items))}
      initialCursor={nextCursor}
      counts={counts}
    />
  )
}
