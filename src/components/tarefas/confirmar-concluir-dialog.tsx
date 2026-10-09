'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface Props {
  /** Título da tarefa a concluir; `null` mantém o diálogo fechado. */
  titulo: string | null
  onConfirm: () => void
  onCancel: () => void
}

/** Confirmação antes de marcar uma tarefa como concluída. */
export function ConfirmarConcluirDialog({ titulo, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={titulo !== null} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Concluir tarefa?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Vai marcar a tarefa <strong className="text-foreground">{titulo}</strong> como concluída.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={onConfirm}>
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
