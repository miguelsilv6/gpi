'use client'

import { useState } from 'react'
import { Bell, Check, CheckCheck, Loader2, Trash2, History } from 'lucide-react'
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
  limpa: boolean
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
  const [showHistory, setShowHistory] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ cursor: nextCursor })
      if (showHistory) params.set('history', 'true')
      const res = await fetch(`/api/notificacoes?${params}`)
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

  async function toggleHistory() {
    const next = !showHistory
    setShowHistory(next)

    if (next && !historyLoaded) {
      setLoadingMore(true)
      try {
        const res = await fetch('/api/notificacoes?history=true')
        if (!res.ok) throw new Error()
        const data = await res.json()
        setNotificacoes(data.items)
        setNextCursor(data.nextCursor)
        setHistoryLoaded(true)
      } catch {
        toast.error('Erro ao carregar histórico')
        setShowHistory(false)
      } finally {
        setLoadingMore(false)
      }
    } else if (!next) {
      // Reload active notifications
      setLoadingMore(true)
      try {
        const res = await fetch('/api/notificacoes')
        if (!res.ok) throw new Error()
        const data = await res.json()
        setNotificacoes(data.items)
        setNextCursor(data.nextCursor)
        setHistoryLoaded(false)
      } catch {
        toast.error('Erro ao carregar notificações')
        setShowHistory(true)
      } finally {
        setLoadingMore(false)
      }
    }
  }

  async function markRead(id: string) {
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

  async function clearOne(id: string) {
    setNotificacoes((prev) => prev.filter((n) => n.id !== id))
    let ok = false
    try {
      const res = await fetch(`/api/notificacoes/${id}?action=clear`, { method: 'PATCH' })
      ok = res.ok
    } catch { /* network */ }
    if (!ok) {
      // Restore on failure
      const res = await fetch('/api/notificacoes')
      if (res.ok) {
        const data = await res.json()
        setNotificacoes(data.items)
        setNextCursor(data.nextCursor)
      }
      toast.error('Erro ao limpar notificação')
    }
  }

  async function clearAll() {
    const prev = notificacoes
    const prevCursor = nextCursor
    setNotificacoes([])
    setNextCursor(null)
    let ok = false
    try {
      const res = await fetch('/api/notificacoes/clear', { method: 'POST' })
      ok = res.ok
    } catch { /* network */ }
    if (!ok) {
      setNotificacoes(prev)
      setNextCursor(prevCursor)
      toast.error('Erro ao limpar notificações')
    } else {
      toast.success('Notificações limpas')
    }
  }

  const unreadCount = notificacoes.filter((n) => !n.lida && !n.limpa).length
  const activeNotifications = showHistory ? notificacoes : notificacoes.filter((n) => !n.limpa)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleHistory}
          className="gap-1.5 text-xs"
          disabled={loadingMore}
        >
          <History className="h-3.5 w-3.5" />
          {showHistory ? 'Ocultar histórico' : 'Ver histórico'}
        </Button>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="gap-1.5 text-xs">
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas como lidas
            </Button>
          )}
          {activeNotifications.length > 0 && !showHistory && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5 text-xs text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Limpar todas
            </Button>
          )}
        </div>
      </div>

      {loadingMore && activeNotifications.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : activeNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Bell className="h-8 w-8 mb-3 opacity-40" />
          <p className="text-sm">{showHistory ? 'Sem notificações no histórico' : 'Sem notificações'}</p>
        </div>
      ) : (
        <>
          {activeNotifications.map((n) => (
            <div
              key={n.id}
              className={cn(
                'rounded-xl border bg-card p-4 transition-colors',
                !n.lida && !n.limpa && 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20',
                n.limpa && 'opacity-50',
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  'h-2 w-2 rounded-full shrink-0 mt-2',
                  n.limpa ? 'bg-muted-foreground/20' : n.lida ? 'bg-muted-foreground/30' : 'bg-blue-500',
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
                    {n.limpa && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        limpa
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-sm mt-0.5">{n.titulo}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.mensagem}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDateTime(new Date(n.createdAt))}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!n.lida && !n.limpa && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      title="Marcar como lida"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  {!n.limpa && (
                    <button
                      onClick={() => clearOne(n.id)}
                      className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
                      title="Limpar notificação"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
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
        </>
      )}
    </div>
  )
}
