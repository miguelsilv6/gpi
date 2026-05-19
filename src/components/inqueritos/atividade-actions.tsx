'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Pencil, Trash2 } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog'

interface Props {
  atividadeId: string
  descricao: string
  inqueritoSlug: string
}

/**
 * Inline edit/delete controls for an atividade. The edit button navigates to
 * the dedicated edit page; delete opens the confirmation dialog and calls
 * the API on success. Caller is responsible for hiding these controls when
 * the user has no permission (e.g. terminal state).
 */
export function AtividadeActions({ atividadeId, descricao, inqueritoSlug }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch(`/api/atividades/${atividadeId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao eliminar atividade')
        setLoading(false)
        return
      }
      toast.success('Atividade eliminada')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede ao eliminar atividade')
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-0.5 shrink-0">
        <Link
          href={`/inqueritos/${inqueritoSlug}/atividade/${atividadeId}/editar`}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Editar atividade"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="p-1.5 rounded hover:bg-muted text-red-500 hover:text-red-700"
          title="Eliminar atividade"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title="Eliminar atividade"
        entityLabel={descricao}
        description="A atividade é removida permanentemente do registo do inquérito. A ação fica registada no histórico de alterações."
        confirmToken="ELIMINAR"
        inputLabel="Para confirmar, digite"
        destructiveLabel="Eliminar atividade"
        onConfirm={handleDelete}
        loading={loading}
      />
    </>
  )
}
