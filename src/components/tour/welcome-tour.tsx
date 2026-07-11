'use client'

import { useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { buildTourSteps, START_TOUR_EVENT } from '@/lib/tour-steps'
import type { Role } from '@/generated/prisma/enums'
import type { NavModuleFlags } from '@/components/layout/nav-items'

interface Props {
  role: Role
  /** true = utilizador já viu/saltou a tour → não arranca automaticamente. */
  done: boolean
  modules: NavModuleFlags
}

async function marcarConcluida() {
  try {
    await fetch('/api/tour', { method: 'POST' })
  } catch {
    // Silencioso: não vale a pena incomodar o utilizador se falhar.
  }
}

/**
 * Visita guiada de boas-vindas (driver.js). Monta-se no layout, arranca sozinha
 * na primeira vez (apenas em ecrãs onde a barra lateral é visível) e pode ser
 * reativada a partir de qualquer lado via `START_TOUR_EVENT`.
 */
export function WelcomeTour({ role, done, modules }: Props) {
  const runningRef = useRef(false)

  useEffect(() => {
    function start() {
      if (runningRef.current) return
      runningRef.current = true
      const steps = buildTourSteps(role, modules)
      const d = driver({
        showProgress: true,
        allowClose: true,
        overlayColor: 'rgba(0,0,0,0.55)',
        nextBtnText: 'Seguinte',
        prevBtnText: 'Anterior',
        doneBtnText: 'Concluir',
        progressText: '{{current}} de {{total}}',
        steps,
        onDestroyed: () => {
          runningRef.current = false
          void marcarConcluida()
        },
      })
      d.drive()
    }

    // Arranque automático na 1.ª vez — só quando a barra lateral está visível
    // (md+), para os passos terem alvos no ecrã.
    const isDesktop =
      typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
    let timer: ReturnType<typeof setTimeout> | undefined
    if (!done && isDesktop) {
      timer = setTimeout(start, 700)
    }

    window.addEventListener(START_TOUR_EVENT, start)
    return () => {
      window.removeEventListener(START_TOUR_EVENT, start)
      if (timer) clearTimeout(timer)
    }
  }, [done, role, modules])

  return null
}
