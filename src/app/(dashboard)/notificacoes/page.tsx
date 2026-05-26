import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { NotificacoesList } from '@/components/notificacoes/notificacoes-list'

const PAGE_SIZE = 20

export default async function NotificacoesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const notificacoes = await prisma.notificacao.findMany({
    where: { utilizadorId: session.user.id, limpa: false },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    include: { inquerito: { select: { nuipc: true } } },
  })

  const hasMore = notificacoes.length > PAGE_SIZE
  const items = hasMore ? notificacoes.slice(0, PAGE_SIZE) : notificacoes
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
        <p className="text-muted-foreground text-sm">
          {items.filter((n) => !n.lida).length} por ler
        </p>
      </div>
      <NotificacoesList initialNotificacoes={items} initialNextCursor={nextCursor} />
    </div>
  )
}
