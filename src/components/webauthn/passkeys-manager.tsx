'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Fingerprint, Trash2, Loader2, Plus } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface Passkey {
  id: string
  nome: string | null
  deviceType: string | null
  backedUp: boolean
  createdAt: string
  lastUsedAt: string | null
}

/**
 * Gestão de passkeys (WebAuthn) do próprio utilizador, no Perfil: registar uma
 * nova (biometria / chave de segurança), listar e remover. É um método de
 * início de sessão adicional — a password continua a funcionar.
 */
export function PasskeysManager() {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [nome, setNome] = useState('')

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && browserSupportsWebAuthn())
    void refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const r = await fetch('/api/webauthn/credentials')
      const data = await r.json()
      setPasskeys(data.credenciais ?? [])
    } catch {
      // silencioso — mostra lista vazia
    } finally {
      setLoading(false)
    }
  }

  async function addPasskey() {
    setRegistering(true)
    try {
      const optRes = await fetch('/api/webauthn/register')
      if (!optRes.ok) throw new Error('options')
      const options = await optRes.json()

      const attResp = await startRegistration(options)

      const verifyRes = await fetch('/api/webauthn/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attResp, nome: nome.trim() || undefined }),
      })
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({}))
        throw new Error(body.error ?? 'verify')
      }
      setNome('')
      toast.success('Passkey registada')
      await refresh()
    } catch (err) {
      // Cancelar o diálogo do browser lança NotAllowedError — não é erro real.
      if (err instanceof Error && err.name === 'NotAllowedError') {
        // cancelado pelo utilizador
      } else {
        toast.error(err instanceof Error && err.message !== 'verify' ? err.message : 'Não foi possível registar a passkey')
      }
    } finally {
      setRegistering(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remover esta passkey? Deixará de poder iniciar sessão com ela.')) return
    try {
      const res = await fetch('/api/webauthn/credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error()
      setPasskeys((prev) => prev.filter((p) => p.id !== id))
      toast.success('Passkey removida')
    } catch {
      toast.error('Não foi possível remover a passkey')
    }
  }

  if (supported === false) {
    return (
      <p className="text-sm text-muted-foreground">
        Este dispositivo/browser não suporta passkeys. No iPhone, adicione a aplicação ao ecrã
        principal e use uma versão recente do iOS.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        As passkeys permitem iniciar sessão com biometria (Face ID / impressão digital) ou uma
        chave de segurança, sem escrever a password. A password continua disponível.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </p>
      ) : passkeys.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Ainda não tem passkeys registadas.</p>
      ) : (
        <ul className="rounded-xl border divide-y">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex items-center gap-2.5">
                <Fingerprint className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.nome || 'Passkey'}</p>
                  <p className="text-xs text-muted-foreground">
                    Criada {formatDateTime(p.createdAt)}
                    {p.lastUsedAt ? ` · último uso ${formatDateTime(p.lastUsedAt)}` : ' · nunca usada'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="text-muted-foreground hover:text-red-600 shrink-0"
                aria-label="Remover passkey"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome (opcional, ex.: iPhone de serviço)"
          maxLength={60}
          disabled={registering}
          className="max-w-xs"
        />
        <Button size="sm" onClick={addPasskey} disabled={registering}>
          {registering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Adicionar passkey
        </Button>
      </div>
    </div>
  )
}
