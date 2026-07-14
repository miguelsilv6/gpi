'use client'

import { useEffect } from 'react'

/**
 * Regista o service worker (`/sw.js`) uma vez, para toda a app autenticada.
 * É idempotente e silencioso — falhas nunca afetam o resto da UI. O opt-in de
 * push (pedir permissão + subscrever) vive à parte, no Perfil (`PushToggle`).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Sem service worker → sem push; a app funciona na mesma.
      })
    }
    if (document.readyState === 'complete') register()
    else {
      window.addEventListener('load', register, { once: true })
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return null
}
