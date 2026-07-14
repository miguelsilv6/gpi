'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { unsubscribePushThisDevice } from '@/lib/push-client'

/**
 * Opt-in de notificações push por dispositivo (Perfil). Pede permissão do
 * browser, subscreve via PushManager com a chave VAPID pública e regista a
 * subscrição no servidor. O envio efetivo acontece no pipeline de notificações.
 *
 * Estados possíveis:
 *  - unsupported: o browser não tem service worker / PushManager (ex.: iOS só
 *    suporta em PWA instalada no ecrã principal);
 *  - unavailable: o servidor não tem chaves VAPID configuradas;
 *  - blocked: o utilizador negou a permissão de notificações;
 *  - off/on: subscrição inativa/ativa neste dispositivo.
 */

type State = 'loading' | 'unsupported' | 'unavailable' | 'blocked' | 'off' | 'on' | 'busy'

// Converte a chave VAPID (base64url) no ArrayBuffer que o PushManager exige.
// Devolve ArrayBuffer (um BufferSource válido) para evitar qualquer dependência
// da forma genérica de Uint8Array entre versões do TypeScript.
function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buffer = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i)
  return buffer
}

export function PushToggle() {
  const [state, setState] = useState<State>('loading')
  const [publicKey, setPublicKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        if (!cancelled) setState('unsupported')
        return
      }
      let cfg: { configured: boolean; publicKey: string | null }
      try {
        const r = await fetch('/api/push')
        cfg = await r.json()
      } catch {
        if (!cancelled) setState('unavailable')
        return
      }
      if (!cfg.configured || !cfg.publicKey) {
        if (!cancelled) setState('unavailable')
        return
      }
      if (!cancelled) setPublicKey(cfg.publicKey)
      if (Notification.permission === 'denied') {
        if (!cancelled) setState('blocked')
        return
      }
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (!cancelled) setState(sub ? 'on' : 'off')
      } catch {
        if (!cancelled) setState('off')
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  async function enable() {
    if (!publicKey) return
    setState('busy')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'blocked' : 'off')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(publicKey),
      })
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      if (!res.ok) throw new Error('subscribe failed')
      setState('on')
      toast.success('Notificações push ativadas neste dispositivo')
    } catch {
      setState('off')
      toast.error('Não foi possível ativar as notificações push')
    }
  }

  async function disable() {
    setState('busy')
    try {
      await unsubscribePushThisDevice()
      setState('off')
      toast.success('Notificações push desativadas neste dispositivo')
    } catch {
      setState('on')
      toast.error('Não foi possível desativar as notificações push')
    }
  }

  if (state === 'loading') {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> A verificar…
      </p>
    )
  }
  if (state === 'unsupported') {
    return (
      <p className="text-sm text-muted-foreground">
        Este dispositivo/browser não suporta notificações push. No iPhone, adicione primeiro a
        aplicação ao ecrã principal (“Adicionar ao ecrã principal”).
      </p>
    )
  }
  if (state === 'unavailable') {
    return (
      <p className="text-sm text-muted-foreground">
        As notificações push não estão configuradas neste servidor.
      </p>
    )
  }
  if (state === 'blocked') {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-500">
        As notificações estão bloqueadas nas definições do browser. Autorize-as para este site e
        volte a tentar.
      </p>
    )
  }

  const busy = state === 'busy'
  const on = state === 'on'
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <p className="text-sm text-muted-foreground max-w-md">
        {on
          ? 'Este dispositivo recebe notificações push do GPI mesmo com o separador fechado.'
          : 'Ative para receber notificações push do GPI neste dispositivo (prazos, alertas, atribuições).'}
      </p>
      <Button
        type="button"
        variant={on ? 'outline' : 'default'}
        size="sm"
        onClick={on ? disable : enable}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : on ? (
          <BellOff className="h-4 w-4 mr-2" />
        ) : (
          <Bell className="h-4 w-4 mr-2" />
        )}
        {on ? 'Desativar' : 'Ativar'} push neste dispositivo
      </Button>
    </div>
  )
}
