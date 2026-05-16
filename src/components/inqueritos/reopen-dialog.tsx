'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { RotateCcw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function ReopenDialog({ slug }: { slug: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (motivo.trim().length < 10) {
      toast.error('Indique um motivo (mínimo 10 caracteres)')
      return
    }
    setLoading(true)
    const res = await fetch(`/api/inqueritos/${slug}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo.trim() }),
    })
    setLoading(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao reabrir inquérito')
      return
    }
    toast.success('Inquérito reaberto')
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <RotateCcw className="h-3.5 w-3.5" />
        Reabrir
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reabrir inquérito</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          A reabertura passa o estado para <strong>Em investigação</strong> e remove a data
          de conclusão. A ação fica registada com o motivo indicado.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="motivo">Motivo da reabertura</Label>
          <Textarea
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={4}
            placeholder="Indique o motivo, decisão ou despacho que justifica a reabertura..."
            maxLength={2000}
          />
          <p className="text-xs text-muted-foreground">Mínimo 10 caracteres.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={loading || motivo.trim().length < 10}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar reabertura
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
