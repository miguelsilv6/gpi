'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { signOut } from 'next-auth/react'
import { unsubscribePushThisDevice } from '@/lib/push-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  timeoutMinutes: number
}

const ACTIVITY_EVENTS = [
  'mousemove',
  'keydown',
  'click',
  'scroll',
  'touchstart',
  'pointerdown',
] as const

const STORAGE_KEY = 'gpi_last_activity'

function readStoredActivity(): number | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (!v) return null
    const n = parseInt(v, 10)
    return isNaN(n) ? null : n
  } catch {
    return null
  }
}

function writeStoredActivity(ts: number) {
  try { localStorage.setItem(STORAGE_KEY, ts.toString()) } catch { /* private browsing */ }
}

export function IdleTimeoutGuard({ timeoutMinutes }: Props) {
  const lastActivityRef = useRef(Date.now())
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [warning, setWarning] = useState(false)

  const resetActivity = useCallback(() => {
    const now = Date.now()
    lastActivityRef.current = now
    writeStoredActivity(now)
    setWarning(false)
    setSecondsLeft(null)
  }, [])

  useEffect(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return

    const timeoutMs = timeoutMinutes * 60_000
    const warnMs = Math.min(timeoutMs * 0.25, 60_000)

    // Initialise from localStorage so a page reload doesn't reset the clock —
    // but only if that activity is still within the timeout window. Otherwise
    // (e.g. a fresh login after the previous session went idle, or after
    // closing the tab overnight) the stale timestamp would already be "expired"
    // and trigger an immediate sign-out right after the dashboard mounts.
    const stored = readStoredActivity()
    if (stored && Date.now() - stored < timeoutMs) {
      lastActivityRef.current = stored
    } else {
      lastActivityRef.current = Date.now()
      writeStoredActivity(Date.now())
    }

    const handleActivity = () => {
      const now = Date.now()
      lastActivityRef.current = now
      writeStoredActivity(now)
    }

    // Sync activity across tabs — another tab's activity resets this tab's timer.
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      const parsed = parseInt(e.newValue, 10)
      if (!isNaN(parsed)) {
        lastActivityRef.current = parsed
        setWarning(false)
        setSecondsLeft(null)
      }
    }

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, handleActivity, { passive: true })
    }
    window.addEventListener('storage', handleStorage)

    const interval = setInterval(() => {
      // Pull the latest value from localStorage in case another tab wrote it
      // between storage events (e.g. same-tab throttling).
      const latest = readStoredActivity()
      if (latest && latest > lastActivityRef.current) {
        lastActivityRef.current = latest
      }

      const idle = Date.now() - lastActivityRef.current
      if (idle >= timeoutMs) {
        clearInterval(interval)
        // Limpa a subscrição push deste dispositivo antes de sair (partilha).
        void unsubscribePushThisDevice()
          .catch(() => {})
          .then(() => signOut({ redirect: false }))
          .catch(() => {/* ignore — redirect happens regardless */})
          .finally(() => {
            window.location.replace('/login?reason=idle')
          })
        return
      }
      const remaining = timeoutMs - idle
      const showWarning = remaining <= warnMs
      setWarning(showWarning)
      setSecondsLeft(showWarning ? Math.ceil(remaining / 1000) : null)
    }, 1_000)

    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', handleStorage)
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, handleActivity)
      }
    }
  }, [timeoutMinutes])

  if (!timeoutMinutes || timeoutMinutes <= 0) return null

  // onOpenChange no-op blocks Escape; disablePointerDismissal blocks outside click
  return (
    <Dialog open={warning} onOpenChange={() => {}} disablePointerDismissal>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Sessão prestes a expirar</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Por inatividade, a sua sessão será terminada em{' '}
          <strong className="text-foreground tabular-nums">{secondsLeft ?? 0}</strong>{' '}
          segundo{secondsLeft === 1 ? '' : 's'}.
        </p>
        <DialogFooter>
          <Button onClick={resetActivity}>Continuar sessão</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
