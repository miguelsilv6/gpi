'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function CreateControloDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [descricao, setDescricao] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [nuipc, setNuipc] = useState('')
  const [dataInicio, setDataInicio] = useState(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [periodico, setPeriodico] = useState(false)
  const [periodoDias, setPeriodoDias] = useState('15')
  const [alertaDias, setAlertaDias] = useState('3')

  function reset() {
    setDescricao('')
    setObservacoes('')
    setNuipc('')
    setDataInicio(new Date().toISOString().slice(0, 10))
    setPeriodico(false)
    setPeriodoDias('15')
    setAlertaDias('3')
  }

  async function submit() {
    if (!descricao.trim()) {
      toast.error('A descrição é obrigatória')
      return
    }
    if (!dataInicio) {
      toast.error('A data de início é obrigatória')
      return
    }

    const alertaDiasNum = parseInt(alertaDias, 10)
    if (isNaN(alertaDiasNum) || alertaDiasNum < 1 || alertaDiasNum > 90) {
      toast.error('Dias de alerta deve ser entre 1 e 90')
      return
    }

    let periodoDiasNum: number | null = null
    if (periodico) {
      periodoDiasNum = parseInt(periodoDias, 10)
      if (isNaN(periodoDiasNum) || periodoDiasNum < 1 || periodoDiasNum > 365) {
        toast.error('Período deve ser entre 1 e 365 dias')
        return
      }
    }

    setLoading(true)
    const res = await fetch('/api/controlos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        descricao: descricao.trim(),
        observacoes: observacoes.trim() || null,
        dataInicio,
        periodoDias: periodoDiasNum,
        alertaDias: alertaDiasNum,
        nuipc: nuipc.trim() || null,
      }),
    })
    setLoading(false)

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao criar controlo')
      return
    }

    toast.success('Controlo criado')
    reset()
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Novo controlo
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo controlo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cc-descricao">Descrição *</Label>
              <Input
                id="cc-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Entrega de relatório intercalar"
                maxLength={500}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc-nuipc">NUIPC (opcional)</Label>
              <Input
                id="cc-nuipc"
                value={nuipc}
                onChange={(e) => setNuipc(e.target.value.toUpperCase())}
                placeholder="Ex: 123/25.4GBCBR"
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground">
                Deixe vazio para um controlo independente de inquérito.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc-data">Data de início *</Label>
              <Input
                id="cc-data"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  id="cc-periodico"
                  type="checkbox"
                  checked={periodico}
                  onChange={(e) => setPeriodico(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="cc-periodico" className="cursor-pointer">
                  Controlo periódico (recorrente)
                </Label>
              </div>
              {periodico && (
                <div className="pl-6 space-y-1.5">
                  <Label htmlFor="cc-periodo">Período (dias)</Label>
                  <Input
                    id="cc-periodo"
                    type="number"
                    min={1}
                    max={365}
                    value={periodoDias}
                    onChange={(e) => setPeriodoDias(e.target.value)}
                    className="max-w-[120px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Após cada confirmação, o próximo controlo é agendado automaticamente.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc-alerta">Alertar com antecedência (dias)</Label>
              <Input
                id="cc-alerta"
                type="number"
                min={1}
                max={90}
                value={alertaDias}
                onChange={(e) => setAlertaDias(e.target.value)}
                className="max-w-[120px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc-obs">Observações (opcional)</Label>
              <Textarea
                id="cc-obs"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                placeholder="Observações adicionais..."
                maxLength={2000}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setOpen(false); reset() }}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button onClick={submit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar controlo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
