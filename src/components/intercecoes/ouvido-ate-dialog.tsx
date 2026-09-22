'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { Headphones, Loader2 } from 'lucide-react'

export interface OuvidoAteDTO {
  id: string
  numeroProduto: string | null
  data: string
  horaInicio: string | null
  horaFim: string | null
  observacoes: string | null
  createdAt: string
  registadoPor: { id: string; nome: string }
}

interface Props {
  nuipcSlug: string
  linha: { id: string; codigo: string; identificador: string } | null
  onClose: () => void
  canEdit: boolean
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * "Ouvido até" de uma linha: onde o inspetor parou de rever a escuta, para
 * retomar dali na sessão seguinte. Cada registo é uma entrada nova — o
 * histórico mostra o ritmo de acompanhamento e permite recuar se o produto
 * indicado estiver errado.
 */
export function OuvidoAteDialog({ nuipcSlug, linha, onClose, canEdit }: Props) {
  const router = useRouter()
  const [historico, setHistorico] = useState<OuvidoAteDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [numeroProduto, setNumeroProduto] = useState('')
  const [data, setData] = useState(hoje())
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const base = `/api/inqueritos/${nuipcSlug}/intercecoes/linhas`

  const carregar = useCallback(
    async (linhaId: string) => {
      setLoading(true)
      try {
        const res = await fetch(`${base}/${linhaId}/ouvido-ate`)
        if (!res.ok) throw new Error()
        const d = await res.json()
        setHistorico(d.items ?? [])
      } catch {
        toast.error('Erro ao carregar o histórico')
      } finally {
        setLoading(false)
      }
    },
    [base],
  )

  useEffect(() => {
    if (!linha) return
    setNumeroProduto('')
    setData(hoje())
    setHoraInicio('')
    setHoraFim('')
    setObservacoes('')
    void carregar(linha.id)
  }, [linha, carregar])

  async function registar() {
    if (!linha) return
    setSaving(true)
    try {
      const res = await fetch(`${base}/${linha.id}/ouvido-ate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroProduto, data, horaInicio, horaFim, observacoes }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao registar')
        return
      }
      toast.success('Registo guardado')
      setNumeroProduto('')
      setObservacoes('')
      await carregar(linha.id)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={linha !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Headphones className="h-4 w-4" /> Ouvido até
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto -mx-4 px-4 space-y-4">
          {linha && (
            <p className="text-sm text-muted-foreground">
              Código <span className="font-mono text-foreground">{linha.codigo}</span> ·{' '}
              <span className="font-mono">{linha.identificador}</span>
            </p>
          )}

          {canEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ouvidoProduto">N.º do produto</Label>
                <Input
                  id="ouvidoProduto"
                  className="font-mono"
                  placeholder="ex.: 70623"
                  value={numeroProduto}
                  onChange={(e) => setNumeroProduto(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ouvidoData">Data *</Label>
                <Input
                  id="ouvidoData"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ouvidoInicio">Hora de início</Label>
                <Input
                  id="ouvidoInicio"
                  placeholder="HH:mm"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ouvidoFim">Hora de fim</Label>
                <Input
                  id="ouvidoFim"
                  placeholder="HH:mm"
                  value={horaFim}
                  onChange={(e) => setHoraFim(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="ouvidoObs">Observações</Label>
                <Textarea
                  id="ouvidoObs"
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs font-medium text-muted-foreground">Histórico</Label>
            {loading ? (
              <div className="py-4 text-center">
                <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : historico.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-1">Sem registos.</p>
            ) : (
              <ul className="mt-1.5 divide-y border rounded-md">
                {historico.map((h, i) => (
                  <li key={h.id} className="px-3 py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <span>
                        {h.numeroProduto && (
                          <span className="font-mono mr-1.5">#{h.numeroProduto}</span>
                        )}
                        {formatDate(h.data)}
                        {h.horaInicio && ` · ${h.horaInicio}`}
                        {h.horaFim && `–${h.horaFim}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {i === 0 && <span className="mr-1.5 font-medium text-foreground">atual</span>}
                        {h.registadoPor.nome}
                      </span>
                    </div>
                    {h.observacoes && (
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                        {h.observacoes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
          {canEdit && (
            <Button size="sm" onClick={registar} disabled={saving || !data}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Registar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
