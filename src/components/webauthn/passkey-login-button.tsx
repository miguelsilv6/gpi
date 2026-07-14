'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { Fingerprint, Loader2 } from 'lucide-react'

/**
 * Botão "Entrar com passkey" no ecrã de login. Corre a cerimónia de
 * autenticação WebAuthn (sem nome de utilizador), troca a asserção verificada
 * por um bilhete de uso único e estabelece a sessão via `signIn('passkey')`.
 */
export function PasskeyLoginButton({ callbackUrl = '/dashboard' }: { callbackUrl?: string }) {
  const router = useRouter()
  const [supported, setSupported] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && browserSupportsWebAuthn())
  }, [])

  async function loginWithPasskey() {
    setBusy(true)
    try {
      const optRes = await fetch('/api/webauthn/authenticate')
      if (!optRes.ok) throw new Error('options')
      const options = await optRes.json()

      const assertion = await startAuthentication(options)

      const verifyRes = await fetch('/api/webauthn/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: assertion }),
      })
      if (!verifyRes.ok) throw new Error('verify')
      const { ticket } = await verifyRes.json()

      const result = await signIn('passkey', { ticket, redirect: false })
      if (result?.error) throw new Error('signin')

      router.push(callbackUrl)
      router.refresh()
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        // cancelado pelo utilizador — sem toast
      } else {
        toast.error('Não foi possível iniciar sessão com a passkey')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={loginWithPasskey}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
      Entrar com passkey
    </button>
  )
}
