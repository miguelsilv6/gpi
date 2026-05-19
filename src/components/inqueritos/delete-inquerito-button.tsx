'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog'
import { nuipcToSlug } from '@/lib/utils'

interface Props {
  nuipc: string
}

export function DeleteInqueritoButton({ nuipc }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const res = await fetch(`/api/inqueritos/${nuipcToSlug(nuipc)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao eliminar inquérito')
        setLoading(false)
        return
      }
      toast.success('Inquérito eliminado')
      setOpen(false)
      router.push('/inqueritos')
      router.refresh()
    } catch {
      toast.error('Erro de rede ao eliminar inquérito')
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Eliminar
      </Button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title="Eliminar inquérito"
        entityLabel={`NUIPC ${nuipc}`}
        description="O inquérito é marcado como eliminado e deixa de aparecer nas listagens. O histórico de auditoria e as atividades permanecem registadas. Esta ação é destinada a inquéritos criados por engano ou duplicados."
        confirmToken={nuipc}
        inputLabel="Para confirmar, digite o NUIPC"
        destructiveLabel="Eliminar inquérito"
        onConfirm={handleConfirm}
        loading={loading}
      />
    </>
  )
}
