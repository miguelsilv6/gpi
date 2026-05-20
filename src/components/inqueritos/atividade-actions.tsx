'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog'

/**
 * Defines the shape of the "conclude" button (if any):
 *  - 'prazo'      → plain prazo-bearing atividade. Icon-only Check button
 *                   matching the historical "Concluído" behaviour.
 *  - 'devolucao'  → atividade flagged with categoriaDashboard=ENVIADO. Shown
 *                   as a text button "Confirmar devolução".
 *  - 'exame'      → atividade flagged with categoriaDashboard=AGUARDA_EXAMES.
 *                   Shown as a text button "Confirmar conclusão de Exame".
 *  - null         → atividade has neither a deadline nor a dashboard category,
 *                   so it's assumed to be "done on creation". No button shown.
 */
export type ConclusaoMode = 'prazo' | 'devolucao' | 'exame' | null

interface Props {
  atividadeId: string
  descricao: string
  inqueritoSlug: string
  /** ISO string when the atividade was marked concluded; null otherwise. */
  concluidaEm: string | null
  /** Which kind of conclude control to render (or hide). */
  conclusaoMode: ConclusaoMode
}

const TEXT_LABELS: Record<Exclude<ConclusaoMode, null | 'prazo'>, string> = {
  devolucao: 'Confirmar devolução',
  exame: 'Confirmar conclusão de Exame',
}

export function AtividadeActions({
  atividadeId,
  descricao,
  inqueritoSlug,
  concluidaEm,
  conclusaoMode,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [togglingConclude, setTogglingConclude] = useState(false)
  const isConcluida = concluidaEm != null

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

  async function toggleConcluida() {
    setTogglingConclude(true)
    try {
      const res = await fetch(`/api/atividades/${atividadeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concluidaEm: isConcluida ? null : new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao atualizar')
        return
      }
      toast.success(isConcluida ? 'Atividade reaberta' : 'Atividade concluída')
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setTogglingConclude(false)
    }
  }

  // Decide the conclude control shape based on mode + state.
  // - mode null → hide entirely (assumed concluded on creation)
  // - any mode + concluida → small "Reabrir" icon button
  // - 'prazo' + not concluida → icon-only Check button
  // - 'devolucao'|'exame' + not concluida → text button
  let concluirControl: React.ReactNode = null
  if (conclusaoMode !== null) {
    if (isConcluida) {
      concluirControl = (
        <button
          type="button"
          onClick={toggleConcluida}
          disabled={togglingConclude}
          className="p-1.5 rounded hover:bg-muted text-amber-600 hover:text-amber-700"
          title="Reabrir atividade"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )
    } else if (conclusaoMode === 'prazo') {
      concluirControl = (
        <button
          type="button"
          onClick={toggleConcluida}
          disabled={togglingConclude}
          className="p-1.5 rounded hover:bg-muted text-green-600 hover:text-green-700"
          title="Marcar como concluída"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )
    } else {
      // devolucao | exame — full-width text button
      concluirControl = (
        <button
          type="button"
          onClick={toggleConcluida}
          disabled={togglingConclude}
          className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50 px-2 py-0.5 text-xs font-medium transition-colors"
        >
          <Check className="h-3 w-3" />
          {TEXT_LABELS[conclusaoMode]}
        </button>
      )
    }
  }

  return (
    <>
      <div className="flex items-center gap-1 shrink-0">
        {concluirControl}
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
