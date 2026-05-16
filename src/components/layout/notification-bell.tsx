'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell, Check, CheckCheck, ArrowRight, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { cn, nuipcToSlug, formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'

const TIPO_LABELS: Record<string, string> = {
  PRAZO_APROXIMANDO: 'Prazo a aproximar-se',
  PRAZO_ULTRAPASSADO: 'Prazo ultrapassado',
  ATIVIDADE_ADICIONADA: 'Nova atividade',
  INQUERITO_ATRIBUIDO: 'Inquérito atribuído',
  INQUERITO_TRANSFERIDO: 'Inquérito transferido',
}

interface Notificacao {
  id: string
  tipo: string
  titulo: string
  mensagem: string
  lida: boolean
  createdAt: string
  inquerito: { nuipc: string } | null
}

export function NotificationBell() {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notificacoes?count=true', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setCount(data.count)
      }
    } catch { /* silently ignore */ }
  }, [])

  const fetchRecent = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notificacoes?limit=5', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setNotificacoes(data.items ?? [])
        setCount(data.items?.filter((n: Notificacao) => !n.lida).length ?? 0)
      }
    } catch { /* silently ignore */ }
    finally { setLoading(false) }
  }, [])

  // Initial fetch + poll every 90s, paused when tab hidden
  useEffect(() => {
    fetchCount()
    let interval: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (interval) return
      interval = setInterval(fetchCount, 90_000)
    }
    const stop = () => {
      if (!interval) return
      clearInterval(interval)
      interval = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchCount()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchCount])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle() {
    if (!open) fetchRecent()
    setOpen((v) => !v)
  }

  async function markRead(id: string) {
    await fetch(`/api/notificacoes/${id}`, { method: 'PATCH' })
    setNotificacoes((prev) => prev.map((n) => n.id === id ? { ...n, lida: true } : n))
    setCount((c) => Math.max(0, c - 1))
  }

  async function markAllRead() {
    const res = await fetch('/api/notificacoes/read-all', { method: 'POST' })
    if (res.ok) {
      setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })))
      setCount(0)
      toast.success('Todas marcadas como lidas')
    }
  }

  const unread = notificacoes.filter((n) => !n.lida).length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className="relative inline-flex items-center justify-center size-8 rounded-lg hover:bg-muted transition-colors"
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border bg-popover shadow-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="text-sm font-semibold">Notificações</p>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : notificacoes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Bell className="h-6 w-6 mb-2 opacity-40" />
                <p className="text-sm">Sem notificações</p>
              </div>
            ) : notificacoes.map((n) => (
              <div
                key={n.id}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 border-b last:border-0 transition-colors',
                  !n.lida && 'bg-blue-50/50 dark:bg-blue-950/20',
                )}
              >
                <div className={cn(
                  'h-2 w-2 rounded-full shrink-0 mt-1.5',
                  n.lida ? 'bg-muted-foreground/30' : 'bg-blue-500',
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    {TIPO_LABELS[n.tipo] ?? n.tipo}
                  </p>
                  {n.inquerito && (
                    <Link
                      href={`/inqueritos/${nuipcToSlug(n.inquerito.nuipc)}`}
                      className="text-[11px] font-mono text-blue-600 hover:underline"
                      onClick={() => { if (!n.lida) markRead(n.id); setOpen(false) }}
                    >
                      {n.inquerito.nuipc}
                    </Link>
                  )}
                  <p className="text-sm font-medium leading-tight mt-0.5">{n.titulo}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.mensagem}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{formatDateTime(new Date(n.createdAt))}</p>
                </div>
                {!n.lida && (
                  <button
                    onClick={() => markRead(n.id)}
                    className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                    title="Marcar como lida"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t px-4 py-2.5">
            <Link
              href="/notificacoes"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-1"
            >
              Ver todas as notificações
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
