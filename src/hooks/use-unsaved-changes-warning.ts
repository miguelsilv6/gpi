'use client'

import { useEffect } from 'react'

/**
 * Warn the user before unloading the page if there are unsaved changes.
 * Note: Next.js client-side navigation will NOT trigger this — browsers do not
 * fire `beforeunload` for SPA route changes. For full coverage we'd need to
 * intercept Next's router; here we cover refresh/close/back/external navigation.
 */
export function useUnsavedChangesWarning(when: boolean) {
  useEffect(() => {
    if (!when) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Most browsers ignore the custom message and show their own; the
      // `returnValue` assignment is still required for the prompt to appear.
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [when])
}
