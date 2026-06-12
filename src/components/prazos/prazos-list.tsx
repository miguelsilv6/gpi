'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { EstadoBadge } from '@/components/inqueritos/estado-badge'
import { PrazoUrgencyBadge } from './prazo-urgency-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatDate, nuipcToSlug } from '@/lib/utils'
import { Check, Pencil, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { PrazoItem } from './types'

interface Props {
  items: PrazoItem[]
  showInspetor: boolean
  showBrigada: boolean
  alertaDias: number
  emptyMessage?: string
}

export function PrazosList({
  items,
  showInspetor,
  showBrigada,
  alertaDias,
  emptyMessage = 'Sem prazos para mostrar.',
}: Props) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Inquérito</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Atividade</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Prazo</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Urgência</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              {showInspetor && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Inspetor</th>
              )}
              {showBrigada && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Brigada</th>
              )}
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Alertas</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/inqueritos/${nuipcToSlug(p.inquerito.nuipc)}`}
                    className="font-mono font-medium hover:text-blue-600 hover:underline"
                  >
                    {p.inquerito.nuipc}
                  </Link>
                </td>
                <td className="px-4 py-3 max-w-[260px]">
                  <p className="line-clamp-2">{p.descricao}</p>
                  {p.quantidade != null && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Qtd: {p.quantidade}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(p.dataPrazo)}
                </td>
                <td className="px-4 py-3">
                  <PrazoUrgencyBadge
                    dataPrazo={p.dataPrazo}
                    alertaDias={p.alertaDias1 ?? alertaDias}
                  />
                </td>
                <td className="px-4 py-3">
                  <EstadoBadge estado={p.inquerito.estado} />
                </td>
                {showInspetor && (
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.realizadaPor.nome}
                  </td>
                )}
                {showBrigada && (
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.inquerito.brigada?.nome ?? '—'}
                  </td>
                )}
                <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                  <AlertasIndicator
                    dias1={p.alertaDias1}
                    dias2={p.alertaDias2}
                    sent1={p.alerta1Enviado}
                    sent2={p.alerta2Enviado}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <EditPrazoButton prazo={p} />
                    <ConcluirPrazoButton prazo={p} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {items.map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/inqueritos/${nuipcToSlug(p.inquerito.nuipc)}`}
                    className="font-mono text-sm font-semibold hover:text-blue-600 hover:underline"
                  >
                    {p.inquerito.nuipc}
                  </Link>
                  <p className="text-sm mt-1 line-clamp-2">{p.descricao}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Prazo: {formatDate(p.dataPrazo)}
                  </p>
                  {showInspetor && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Inspetor: <span className="text-foreground">{p.realizadaPor.nome}</span>
                    </p>
                  )}
                  {showBrigada && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Brigada: <span className="text-foreground">{p.inquerito.brigada?.nome ?? '—'}</span>
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <PrazoUrgencyBadge
                    dataPrazo={p.dataPrazo}
                    alertaDias={p.alertaDias1 ?? alertaDias}
                  />
                  <EstadoBadge estado={p.inquerito.estado} />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  <AlertasIndicator
                    dias1={p.alertaDias1}
                    dias2={p.alertaDias2}
                    sent1={p.alerta1Enviado}
                    sent2={p.alerta2Enviado}
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <EditPrazoButton prazo={p} compact />
                  <ConcluirPrazoButton prazo={p} compact />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

function AlertasIndicator({
  dias1,
  dias2,
  sent1,
  sent2,
}: {
  dias1: number | null
  dias2: number | null
  sent1: boolean
  sent2: boolean
}) {
  if (dias1 == null && dias2 == null) {
    return <span className="text-muted-foreground/50">—</span>
  }
  return (
    <span className="inline-flex items-center gap-2">
      {dias1 != null && (
        <span
          className="inline-flex items-center gap-0.5"
          title={`Aviso aos ${dias1} dias`}
        >
          {sent1 && <Check className="h-3 w-3 text-green-600" />}
          {dias1}d
        </span>
      )}
      {dias2 != null && (
        <span
          className="inline-flex items-center gap-0.5"
          title={`2.º aviso aos ${dias2} dias`}
        >
          {sent2 && <Check className="h-3 w-3 text-green-600" />}
          {dias2}d
        </span>
      )}
    </span>
  )
}

function EditPrazoButton({ prazo, compact = false }: { prazo: PrazoItem; compact?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dataPrazo, setDataPrazo] = useState(() => {
    const d = typeof prazo.dataPrazo === 'string' ? new Date(prazo.dataPrazo) : prazo.dataPrazo
    return d.toISOString().slice(0, 10)
  })

  function handleOpen() {
    const d = typeof prazo.dataPrazo === 'string' ? new Date(prazo.dataPrazo) : prazo.dataPrazo
    setDataPrazo(d.toISOString().slice(0, 10))
    setOpen(true)
  }

  async function submit() {
    if (!dataPrazo) { toast.error('A data do prazo é obrigatória'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/atividades/${prazo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataPrazo }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao atualizar prazo')
        return
      }
      toast.success('Prazo atualizado')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={compact ? 'h-7 w-7 p-0' : 'h-8 px-2'}
        onClick={handleOpen}
        title="Editar prazo"
      >
        <Pencil className="h-3.5 w-3.5" />
        {!compact && <span className="sr-only">Editar</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar prazo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground line-clamp-2">{prazo.descricao}</p>
            <div className="space-y-1.5">
              <Label htmlFor="edit-prazo-data">Nova data de prazo</Label>
              <Input
                id="edit-prazo-data"
                type="date"
                value={dataPrazo}
                onChange={(e) => setDataPrazo(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ConcluirPrazoButton({ prazo, compact = false }: { prazo: PrazoItem; compact?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function confirm() {
    setLoading(true)
    try {
      const res = await fetch(`/api/atividades/${prazo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concluidaEm: new Date().toISOString() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao concluir prazo')
        return
      }
      toast.success('Prazo concluído')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={`text-green-700 hover:text-green-700 dark:text-green-500 ${compact ? 'h-7 w-7 p-0' : 'h-8 px-2'}`}
        onClick={() => setOpen(true)}
        title="Marcar como concluído"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {!compact && <span className="sr-only">Concluir</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Concluir prazo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Vai marcar a atividade <strong>{prazo.descricao}</strong> como concluída.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={confirm}
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
