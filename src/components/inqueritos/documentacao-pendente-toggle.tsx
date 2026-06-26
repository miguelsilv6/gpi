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
import { Paperclip, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  slug: string
  pendente: boolean
  nota: string | null
}

/**
 * Toggle rápido de "documentação pendente" no detalhe do inquérito. Permite
 * marcar (com nota opcional do que falta), editar a nota ou marcar como junta —
 * sem abrir o formulário de edição completo. Funciona mesmo com o inquérito já
 * concluído/enviado, que é precisamente o caso de uso.
 */
export function DocumentacaoPendenteToggle({ slug, pendente, nota }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notaValue, setNotaValue] = useState(nota ?? '')
  const [loading, setLoading] = useState(false)

  async function save(novoPendente: boolean) {
    setLoading(true)
    const res = await fetch(`/api/inqueritos/${slug}/documentacao-pendente`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendente: novoPendente, nota: notaValue.trim() || null }),
    })
    setLoading(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao atualizar documentação pendente')
      return
    }
    toast.success(
      novoPendente ? 'Marcado: documentação pendente' : 'Documentação marcada como junta',
    )
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => {
          setNotaValue(nota ?? '')
          setOpen(true)
        }}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {pendente ? 'Documentação pendente' : 'Marcar doc. pendente'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Documentação pendente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Assinale que este inquérito tem documentação por juntar (ex.: já foi
            enviado, mas falta anexar documentação que chega depois). Fica listado
            em <strong>Documentação pendente</strong> até ser resolvido.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="docNota">O que falta juntar (opcional)</Label>
            <Textarea
              id="docNota"
              value={notaValue}
              onChange={(e) => setNotaValue(e.target.value)}
              rows={3}
              placeholder="Ex.: relatório do INML, auto de notícia…"
              maxLength={2000}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            {pendente && (
              <Button variant="outline" onClick={() => save(false)} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Marcar como junta
              </Button>
            )}
            <Button onClick={() => save(true)} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pendente ? 'Guardar nota' : 'Marcar pendente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
