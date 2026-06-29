'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Scale, Plus, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export interface ProrrogacaoView {
  id: string
  meses: number
  despacho: string | null
  dataLabel: string
  porNome: string
}

interface Props {
  slug: string
  estado: 'ok' | 'a_vencer' | 'vencido'
  dataLabel: string
  diasRestantes: number
  baseMeses: number
  prorrogacaoMeses: number
  totalMeses: number
  prorrogacoes: ProrrogacaoView[]
  canEdit: boolean
}

const ESTADO_STYLE: Record<Props['estado'], string> = {
  ok: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
  a_vencer: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  vencido: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
}

export function PrazoLegalSection({
  slug,
  estado,
  dataLabel,
  diasRestantes,
  baseMeses,
  prorrogacaoMeses,
  totalMeses,
  prorrogacoes,
  canEdit,
}: Props) {
  const router = useRouter()
  const [meses, setMeses] = useState('')
  const [despacho, setDespacho] = useState('')
  const [loading, setLoading] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const diasLabel =
    diasRestantes < 0
      ? `Ultrapassado há ${Math.abs(diasRestantes)} dia${Math.abs(diasRestantes) === 1 ? '' : 's'}`
      : `Faltam ${diasRestantes} dia${diasRestantes === 1 ? '' : 's'}`

  async function adicionar() {
    const n = Number(meses)
    if (!Number.isInteger(n) || n < 1) {
      toast.error('Indique um nº de meses válido (≥ 1).')
      return
    }
    setLoading(true)
    const res = await fetch(`/api/inqueritos/${slug}/prorrogacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meses: n, despacho: despacho.trim() || null }),
    })
    setLoading(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao registar prorrogação')
      return
    }
    toast.success('Prorrogação registada')
    setMeses('')
    setDespacho('')
    router.refresh()
  }

  async function remover(id: string) {
    setRemoving(id)
    const res = await fetch(`/api/inqueritos/${slug}/prorrogacoes/${id}`, { method: 'DELETE' })
    setRemoving(null)
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao remover prorrogação')
      return
    }
    toast.success('Prorrogação removida')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" />
          Prazo legal
        </CardTitle>
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', ESTADO_STYLE[estado])}>
          {dataLabel} · {diasLabel}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Limite = abertura + {baseMeses} {baseMeses === 1 ? 'mês' : 'meses'} de base
          {prorrogacaoMeses > 0 ? ` + ${prorrogacaoMeses} de prorrogações` : ''} ={' '}
          <span className="font-medium text-foreground">{totalMeses} meses</span>.
        </p>

        {prorrogacoes.length > 0 && (
          <ul className="divide-y rounded-md border text-sm">
            {prorrogacoes.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <span className="font-medium">+{p.meses} {p.meses === 1 ? 'mês' : 'meses'}</span>
                  <span className="text-muted-foreground"> · {p.dataLabel} · {p.porNome}</span>
                  {p.despacho && <p className="text-xs text-muted-foreground break-words">{p.despacho}</p>}
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-red-600"
                    onClick={() => remover(p.id)}
                    disabled={removing === p.id}
                    title="Remover prorrogação"
                  >
                    {removing === p.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="prorrMeses" className="text-xs text-muted-foreground">Meses</Label>
              <Input
                id="prorrMeses"
                type="number"
                min={1}
                max={60}
                value={meses}
                onChange={(e) => setMeses(e.target.value)}
                className="h-9 w-20"
                placeholder="Ex.: 3"
              />
            </div>
            <div className="flex-1 space-y-1 min-w-[180px]">
              <Label htmlFor="prorrDespacho" className="text-xs text-muted-foreground">Despacho (opcional)</Label>
              <Input
                id="prorrDespacho"
                value={despacho}
                onChange={(e) => setDespacho(e.target.value)}
                className="h-9"
                placeholder="Referência do despacho de prorrogação"
                maxLength={500}
              />
            </div>
            <Button size="sm" className="h-9 gap-1.5" onClick={adicionar} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Prorrogação
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
