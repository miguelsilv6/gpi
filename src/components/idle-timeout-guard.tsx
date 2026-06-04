'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { signOut } from 'next-auth/react'
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

export function IdleTimeoutGuard({ timeoutMinutes }: Props) {
  const lastActivityRef = useRef(Date.now())
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [warning, setWarning] = useState(false)

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    setWarning(false)
    setSecondsLeft(null)
  }, [])

  useEffect(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return

    const timeoutMs = timeoutMinutes * 60_000
    const warnMs = Math.min(timeoutMs * 0.25, 60_000)

    const handleActivity = () => {
      lastActivityRef.current = Date.now()
    }

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, handleActivity, { passive: true })
    }

    const interval = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current
      if (idle >= timeoutMs) {
        clearInterval(interval)
        void signOut({ redirect: false }).then(() => {
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
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, handleActivity)
      }
    }
  }, [timeoutMinutes])

  if (!timeoutMinutes || timeoutMinutes <= 0) return null

  return (
    <Dialog open={warning} onOpenChange={() => {}}>
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
