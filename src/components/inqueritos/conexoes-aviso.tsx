'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Link2 } from 'lucide-react'
import type { ConexaoHit } from '@/lib/conexoes'

/**
 * Aviso não-bloqueante no formulário de inquérito: enquanto se preenche o
 * denunciante, consulta (debounced) /api/inqueritos/conexoes e mostra os
 * inquéritos que partilham NIF/contacto/email — dentro do âmbito de leitura
 * do utilizador. Nunca impede a submissão.
 */

const DEBOUNCE_MS = 600
const SHOW_MAX = 3

interface Props {
  nif: string | null | undefined
  contacto: string | null | undefined
  email: string | null | undefined
  /** Slug do próprio inquérito (modo edição) — excluído dos resultados. */
  excludeNuipc?: string
}

export function ConexoesAviso({ nif, contacto, email, excludeNuipc }: Props) {
  const [hits, setHits] = useState<ConexaoHit[]>([])
  const abortRef = useRef<AbortController | null>(null)

  // Só valores com potencial de match disparam a consulta (evita ruído e
  // pedidos por cada tecla nos primeiros carateres).
  const nifDigits = (nif ?? '').replace(/\D/g, '')
  const contactoDigits = (contacto ?? '').replace(/\D/g, '')
  const emailNorm = (email ?? '').trim()
  const nifQ = nifDigits.length >= 9 ? nif!.trim() : ''
  const contactoQ = contactoDigits.length >= 9 ? contacto!.trim() : ''
  const emailQ = emailNorm.includes('@') && emailNorm.length >= 5 ? emailNorm : ''

  useEffect(() => {
    if (!nifQ && !contactoQ && !emailQ) {
      setHits([])
      return
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const params = new URLSearchParams()
        if (nifQ) params.set('nif', nifQ)
        if (contactoQ) params.set('contacto', contactoQ)
        if (emailQ) params.set('email', emailQ)
        if (excludeNuipc) params.set('excludeNuipc', excludeNuipc)
        const res = await fetch(`/api/inqueritos/conexoes?${params.toString()}`, {
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = (await res.json()) as { items: ConexaoHit[] }
        setHits(data.items ?? [])
      } catch {
        // Silencioso — o aviso é oportunista, nunca interfere com o formulário.
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [nifQ, contactoQ, emailQ, excludeNuipc])

  if (hits.length === 0) return null

  const visiveis = hits.slice(0, SHOW_MAX)
  const extra = hits.length - visiveis.length

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-400/10 dark:text-amber-200">
      <p className="flex items-center gap-1.5 font-medium">
        <Link2 className="h-4 w-4 shrink-0" />
        Denunciante já consta noutro{hits.length === 1 ? '' : 's'} inquérito
        {hits.length === 1 ? '' : 's'}
      </p>
      <ul className="mt-1.5 space-y-1">
        {visiveis.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center gap-x-2">
            <Link
              href={`/inqueritos/${h.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono underline underline-offset-2"
            >
              {h.nuipc}
            </Link>
            <span className="text-xs opacity-80">
              {h.crimeNome} · coincide{' '}
              {h.matches
                .map((m) => (m === 'nif' ? 'NIF' : m === 'contacto' ? 'contacto' : 'email'))
                .join(' + ')}
            </span>
          </li>
        ))}
      </ul>
      {extra > 0 && <p className="mt-1 text-xs opacity-80">e mais {extra}…</p>}
    </div>
  )
}
