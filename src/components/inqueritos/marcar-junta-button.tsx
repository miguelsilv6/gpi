'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Ação "Marcar como junta" da página de Documentação Pendente: limpa a flag do
 * inquérito via endpoint dedicado e atualiza a lista.
 */
export function MarcarJuntaButton({ slug }: { slug: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function resolve() {
    setLoading(true)
    const res = await fetch(`/api/inqueritos/${slug}/documentacao-pendente`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendente: false }),
    })
    setLoading(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao marcar como junta')
      return
    }
    toast.success('Documentação marcada como junta')
    router.refresh()
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={resolve}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
      Marcar como junta
    </Button>
  )
}
