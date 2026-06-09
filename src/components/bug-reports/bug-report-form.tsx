'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils'
import {
  SEVERIDADE_LABELS,
  SEVERIDADE_VALUES,
  SEVERIDADE_COLORS,
  ESTADO_LABELS,
  ESTADO_COLORS,
} from '@/lib/bugreport-labels'
import type { SeveridadeBug, EstadoBug } from '@/generated/prisma/enums'
import { Loader2, Send } from 'lucide-react'

interface MyBugReport {
  id: string
  titulo: string
  descricao: string
  severidade: SeveridadeBug
  estado: EstadoBug
  notaAdmin: string | null
  createdAt: string
}

export function BugReportForm() {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [severidade, setSeveridade] = useState<SeveridadeBug>('MEDIA')
  const [pagina, setPagina] = useState('')
  const [saving, setSaving] = useState(false)

  const [mine, setMine] = useState<MyBugReport[]>([])
  const [loadingMine, setLoadingMine] = useState(true)
  const [mineCursor, setMineCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  async function loadMine(cursor?: string) {
    const isInitial = !cursor
    if (isInitial) setLoadingMine(true); else setLoadingMore(true)
    try {
      const params = new URLSearchParams({ mine: '1' })
      if (cursor) params.set('cursor', cursor)
      const res = await fetch(`/api/bug-reports?${params}`)
      const data = await res.json()
      const items: MyBugReport[] = data.items ?? []
      setMine((prev) => (isInitial ? items : [...prev, ...items]))
      setMineCursor(data.nextCursor ?? null)
    } catch {
      // silencioso — a lista é informativa
    } finally {
      if (isInitial) setLoadingMine(false); else setLoadingMore(false)
    }
  }

  useEffect(() => {
    void loadMine()
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          severidade,
          pagina: pagina.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao submeter o report')
        return
      }
      toast.success('Bug reportado. Obrigado!')
      setTitulo('')
      setDescricao('')
      setSeveridade('MEDIA')
      setPagina('')
      void loadMine(undefined)
    } catch {
      toast.error('Erro ao submeter o report')
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = titulo.trim().length >= 3 && descricao.trim().length >= 10 && !saving

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo report</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título *</Label>
              <Input
                id="titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Resumo curto do problema"
                maxLength={150}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="descricao">Descrição *</Label>
              <Textarea
                id="descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="O que aconteceu? Que passos levam ao problema? O que esperava que acontecesse?"
                rows={6}
                maxLength={5000}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Severidade</Label>
                <Select value={severidade} onValueChange={(v) => setSeveridade(v as SeveridadeBug)}>
                  <SelectTrigger className="h-9 w-full text-sm">
                    <SelectValue>
                      {(v: string) => SEVERIDADE_LABELS[v as SeveridadeBug] ?? 'Média'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERIDADE_VALUES.map((s) => (
                      <SelectItem key={s} value={s}>{SEVERIDADE_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pagina">Página/contexto (opcional)</Label>
                <Input
                  id="pagina"
                  value={pagina}
                  onChange={(e) => setPagina(e.target.value)}
                  placeholder="ex: /inqueritos"
                  maxLength={300}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!canSubmit} className="gap-1.5">
                <Send className="h-4 w-4" />
                Submeter
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Os meus reports</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMine ? (
            <p className="text-sm text-muted-foreground">A carregar...</p>
          ) : mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não submeteu nenhum report.</p>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-3">
                {mine.map((r) => (
                  <li key={r.id} className="rounded-lg border p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{r.titulo}</p>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', ESTADO_COLORS[r.estado])}>
                        {ESTADO_LABELS[r.estado]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{r.descricao}</p>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SEVERIDADE_COLORS[r.severidade])}>
                        {SEVERIDADE_LABELS[r.severidade]}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                    </div>
                    {r.notaAdmin && (
                      <p className="text-xs bg-muted/50 rounded p-2 mt-1">
                        <span className="font-medium">Resposta do admin:</span> {r.notaAdmin}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {mineCursor && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={loadingMore}
                  onClick={() => void loadMine(mineCursor)}
                >
                  {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Carregar mais'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
