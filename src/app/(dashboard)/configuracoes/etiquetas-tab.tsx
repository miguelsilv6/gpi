'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Trash2, Tag } from 'lucide-react'
import { cn, iconButtonClasses } from '@/lib/utils'

interface EtiquetaAdmin {
  id: string
  nome: string
  createdAt: string
  criadoPor: { id: string; nome: string }
  _count: { inqueritos: number }
}

export function EtiquetasTab() {
  const [etiquetas, setEtiquetas] = useState<EtiquetaAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteCandidate, setDeleteCandidate] = useState<EtiquetaAdmin | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/etiquetas?all=1')
    if (res.ok) setEtiquetas(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete() {
    if (!deleteCandidate) return
    setDeleting(true)
    const res = await fetch(`/api/etiquetas/${deleteCandidate.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      toast.error(e.error ?? 'Erro ao eliminar')
      return
    }
    setEtiquetas((prev) => prev.filter((x) => x.id !== deleteCandidate.id))
    setDeleteCandidate(null)
    toast.success('Etiqueta eliminada')
  }

  if (loading) return <div className="text-sm text-muted-foreground py-4">A carregar...</div>

  // Group by creator
  const byCreator = etiquetas.reduce<Record<string, { nome: string; items: EtiquetaAdmin[] }>>(
    (acc, e) => {
      const key = e.criadoPor.id
      if (!acc[key]) acc[key] = { nome: e.criadoPor.nome, items: [] }
      acc[key]!.items.push(e)
      return acc
    },
    {},
  )

  const groups = Object.values(byCreator).sort((a, b) => a.nome.localeCompare(b.nome))

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Etiquetas pessoais criadas pelos utilizadores e aplicadas a inquéritos. Cada
        utilizador gere as suas; a Administração pode eliminar etiquetas sem uso.
      </p>

      {etiquetas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhuma etiqueta criada por nenhum utilizador.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.nome} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
                {group.nome}
              </p>
              <div className="rounded-xl border overflow-hidden bg-card">
                {group.items.map((e, i) => (
                  <div
                    key={e.id}
                    className={cn('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t')}
                  >
                    <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{e.nome}</span>
                    </div>
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                        e._count.inqueritos > 0
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {e._count.inqueritos} inquérito(s)
                    </span>
                    <button
                      onClick={() => setDeleteCandidate(e)}
                      disabled={e._count.inqueritos > 0}
                      className={cn(
                        iconButtonClasses,
                        e._count.inqueritos > 0
                          ? 'text-muted-foreground/30 cursor-not-allowed'
                          : 'text-red-500 hover:text-red-700',
                      )}
                      aria-label={`Eliminar etiqueta ${e.nome}`}
                      title={
                        e._count.inqueritos > 0
                          ? 'Em uso — não pode ser eliminada'
                          : 'Eliminar etiqueta'
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!deleteCandidate} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar etiqueta</DialogTitle>
          </DialogHeader>
          {deleteCandidate && (
            <p className="text-sm">
              Eliminar a etiqueta <strong>«{deleteCandidate.nome}»</strong> de{' '}
              <strong>{deleteCandidate.criadoPor.nome}</strong>?
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteCandidate(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
