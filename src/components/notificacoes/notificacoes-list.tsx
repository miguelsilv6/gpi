'use client'

import { useState } from 'react'
import { Bell, Check, CheckCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateTime, cn, nuipcToSlug } from '@/lib/utils'
import Link from 'next/link'
import { toast } from 'sonner'
import { tipoNotificacaoLabel } from '@/lib/notification-labels'

interface Notificacao {
  id: string
  tipo: string
  titulo: string
  mensagem: string
  lida: boolean
  createdAt: Date | string
  inquerito: { nuipc: string } | null
}

interface Props {
  initialNotificacoes: Notificacao[]
  initialNextCursor: string | null
}

export function NotificacoesList({ initialNotificacoes, initialNextCursor }: Props) {
  const [notificacoes, setNotificacoes] = useState(initialNotificacoes)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [loadingMore, setLoadingMore] = useState(false)

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/notificacoes?cursor=${nextCursor}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setNotificacoes((prev) => [...prev, ...data.items])
      setNextCursor(data.nextCursor)
    } catch {
      toast.error('Erro ao carregar mais notificações')
    } finally {
      setLoadingMore(false)
    }
  }

  async function markRead(id: string) {
    // Optimistic + revert pattern (ver notification-bell.tsx).
    setNotificacoes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, lida: true } : n)),
    )
    let ok = false
    try {
      const res = await fetch(`/api/notificacoes/${id}`, { method: 'PATCH' })
      ok = res.ok
    } catch { /* network */ }
    if (!ok) {
      setNotificacoes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, lida: false } : n)),
      )
      toast.error('Erro a marcar notificação como lida')
    }
  }

  async function markAllRead() {
    const res = await fetch('/api/notificacoes/read-all', { method: 'POST' })
    if (res.ok) {
      setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })))
      toast.success('Todas marcadas como lidas')
    }
  }

  const unreadCount = notificacoes.filter((n) => !n.lida).length

  if (notificacoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Bell className="h-8 w-8 mb-3 opacity-40" />
        <p className="text-sm">Sem notificações</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={markAllRead} className="gap-1.5 text-xs">
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar todas como lidas
          </Button>
        </div>
      )}

      {notificacoes.map((n) => (
        <div
          key={n.id}
          className={cn(
            'rounded-xl border bg-card p-4 transition-colors',
            !n.lida && 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20',
          )}
        >
          <div className="flex items-start gap-3">
            <div className={cn(
              'h-2 w-2 rounded-full shrink-0 mt-2',
              n.lida ? 'bg-muted-foreground/30' : 'bg-blue-500',
            )} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tipoNotificacaoLabel(n.tipo)}
                </p>
                {n.inquerito && (
                  <Link
                    href={`/inqueritos/${nuipcToSlug(n.inquerito.nuipc)}`}
                    className="text-xs font-mono text-blue-600 hover:underline"
                    onClick={() => !n.lida && markRead(n.id)}
                  >
                    {n.inquerito.nuipc}
                  </Link>
                )}
              </div>
              <p className="font-medium text-sm mt-0.5">{n.titulo}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{n.mensagem}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatDateTime(new Date(n.createdAt))}</p>
            </div>
            {!n.lida && (
              <button
                onClick={() => markRead(n.id)}
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
                title="Marcar como lida"
              >
                <Check className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ))}

      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  )
}
