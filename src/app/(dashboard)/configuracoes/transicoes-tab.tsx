'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Plus, Trash2, ArrowRight } from 'lucide-react'
import { cn, iconButtonClasses } from '@/lib/utils'

interface EstadoRef {
  id: string
  codigo: string
  nome: string
  terminal: boolean
}
interface Estado extends EstadoRef {
  ativo: boolean
}
interface Regra {
  id: string
  meses: number
  ativa: boolean
  origem: EstadoRef
  destino: EstadoRef
}

export function TransicoesTab() {
  const [estados, setEstados] = useState<Estado[]>([])
  const [regras, setRegras] = useState<Regra[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [neu, setNeu] = useState({ origemId: '', destinoId: '', meses: 12 })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const [er, rr] = await Promise.all([
      fetch('/api/estados-inquerito'),
      fetch('/api/transicoes-automaticas'),
    ])
    if (er.ok) setEstados(await er.json())
    if (rr.ok) setRegras(await rr.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const estadosAtivos = useMemo(() => estados.filter((e) => e.ativo), [estados])
  const usados = useMemo(() => new Set(regras.map((r) => r.origem.id)), [regras])
  // Origem: ativo, não-terminal e ainda sem regra. Destino: qualquer ativo.
  const origensDisponiveis = estadosAtivos.filter((e) => !e.terminal && !usados.has(e.id))

  async function handleAdd() {
    if (!neu.origemId || !neu.destinoId) {
      toast.error('Escolha os estados de origem e destino')
      return
    }
    if (neu.origemId === neu.destinoId) {
      toast.error('Origem e destino têm de ser diferentes')
      return
    }
    setSaving(true)
    const res = await fetch('/api/transicoes-automaticas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(neu),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao criar regra')
      return
    }
    toast.success('Regra criada')
    setNeu({ origemId: '', destinoId: '', meses: 12 })
    setAdding(false)
    load()
  }

  async function patchRegra(id: string, data: Partial<{ meses: number; ativa: boolean; destinoId: string }>) {
    const res = await fetch(`/api/transicoes-automaticas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro')
      return false
    }
    return true
  }

  async function handleToggle(r: Regra) {
    if (await patchRegra(r.id, { ativa: !r.ativa })) {
      toast.success(`Regra ${!r.ativa ? 'ativada' : 'desativada'}`)
      load()
    }
  }

  async function handleMeses(r: Regra, meses: number) {
    if (meses < 1 || meses > 120 || meses === r.meses) return
    if (await patchRegra(r.id, { meses })) {
      toast.success('Prazo atualizado')
      load()
    }
  }

  async function handleDelete(r: Regra) {
    if (!confirm(`Eliminar a regra ${r.origem.nome} → ${r.destino.nome}?`)) return
    const res = await fetch(`/api/transicoes-automaticas/${r.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao eliminar')
      return
    }
    toast.success('Regra eliminada')
    load()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Transições automáticas</CardTitle>
        {!adding && origensDisponiveis.length > 0 && (
          <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nova regra
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Um inquérito parado no estado de <strong>origem</strong> há mais do que
          o número de meses indicado — <strong>sem qualquer atividade nem mudança
          de estado</strong> nesse período — é movido automaticamente para o
          estado de <strong>destino</strong> por uma rotina diária, notificando o
          inspetor. A origem não pode ser um estado terminal.
        </p>

        {adding && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Estado de origem</Label>
                <Select value={neu.origemId} onValueChange={(v) => setNeu({ ...neu, origemId: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
                  <SelectContent>
                    {origensDisponiveis.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Estado de destino</Label>
                <Select value={neu.destinoId} onValueChange={(v) => setNeu({ ...neu, destinoId: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
                  <SelectContent>
                    {estadosAtivos
                      .filter((e) => e.id !== neu.origemId)
                      .map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome}{e.terminal ? ' (terminal)' : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Inatividade (meses)</Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={neu.meses}
                  onChange={(e) => setNeu({ ...neu, meses: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Criar
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setAdding(false); setNeu({ origemId: '', destinoId: '', meses: 12 }) }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : regras.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Sem regras de transição automática configuradas.
          </p>
        ) : (
          <ul className="space-y-2">
            {regras.map((r) => (
              <li key={r.id} className={cn('rounded-lg border p-3', !r.ativa && 'opacity-60')}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 text-sm flex-wrap">
                    <span className="font-medium">{r.origem.nome}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">{r.destino.nome}</span>
                    {r.destino.terminal && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                        terminal
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        defaultValue={r.meses}
                        onBlur={(e) => handleMeses(r, parseInt(e.target.value) || r.meses)}
                        className="h-8 w-20 text-sm"
                        aria-label="Meses de inatividade"
                      />
                      <span className="text-xs text-muted-foreground">meses</span>
                    </div>
                    <button
                      onClick={() => handleToggle(r)}
                      className={cn(
                        'text-xs px-2 py-1 rounded transition-colors',
                        r.ativa
                          ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400',
                      )}
                      title={r.ativa ? 'Desativar' : 'Ativar'}
                    >
                      {r.ativa ? 'Ativa' : 'Inativa'}
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className={cn(iconButtonClasses, 'text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30')}
                      title="Eliminar"
                      aria-label={`Eliminar regra ${r.origem.nome} para ${r.destino.nome}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
