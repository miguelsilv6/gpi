'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Plus, Pencil, Trash2, Check, X, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ESTADO_COR_CLASSES,
  ESTADO_COR_DEFAULT,
  ESTADO_COR_OPTIONS,
  PROTECTED_ESTADO_CODIGOS,
} from '@/lib/constants'

interface Estado {
  id: string
  codigo: string
  nome: string
  descricao: string | null
  ordem: number
  terminal: boolean
  cor: string | null
  ativo: boolean
}

const EMPTY_NEW = {
  codigo: '',
  nome: '',
  descricao: '',
  ordem: 0,
  terminal: false,
  cor: 'blue' as string,
  ativo: true,
}

export function EstadosTab() {
  const [estados, setEstados] = useState<Estado[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [neu, setNeu] = useState(EMPTY_NEW)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState({
    nome: '',
    descricao: '',
    ordem: 0,
    terminal: false,
    cor: '' as string | null,
  })

  async function load() {
    setLoading(true)
    const res = await fetch('/api/estados-inquerito')
    if (res.ok) setEstados(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    if (!neu.codigo.trim() || !neu.nome.trim()) {
      toast.error('Código e nome são obrigatórios')
      return
    }
    setSaving(true)
    const res = await fetch('/api/estados-inquerito', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...neu,
        codigo: neu.codigo.trim().toUpperCase().replace(/\s+/g, '_'),
        descricao: neu.descricao.trim() || null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao criar estado')
      return
    }
    toast.success('Estado criado')
    setNeu(EMPTY_NEW)
    setAdding(false)
    load()
  }

  async function patchEstado(id: string, data: Partial<Estado>) {
    const res = await fetch(`/api/estados-inquerito/${id}`, {
      method: 'PUT',
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

  async function handleToggleAtivo(e: Estado) {
    const ok = await patchEstado(e.id, { ativo: !e.ativo })
    if (ok) {
      toast.success(`Estado ${!e.ativo ? 'ativado' : 'desativado'}`)
      load()
    }
  }

  async function handleDelete(e: Estado) {
    if (!confirm(`Eliminar o estado "${e.nome}"? Esta ação é permanente.`)) return
    const res = await fetch(`/api/estados-inquerito/${e.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao eliminar')
      return
    }
    toast.success('Estado eliminado')
    load()
  }

  function startEdit(e: Estado) {
    setEditId(e.id)
    setEdit({
      nome: e.nome,
      descricao: e.descricao ?? '',
      ordem: e.ordem,
      terminal: e.terminal,
      cor: e.cor,
    })
  }

  async function saveEdit(id: string) {
    const ok = await patchEstado(id, {
      nome: edit.nome,
      descricao: edit.descricao.trim() || null,
      ordem: edit.ordem,
      terminal: edit.terminal,
      cor: edit.cor,
    })
    if (ok) {
      toast.success('Estado actualizado')
      setEditId(null)
      load()
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Estados de inquérito</CardTitle>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Novo estado
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Estados marcados como <strong>protegidos pelo sistema</strong> (
          {[...PROTECTED_ESTADO_CODIGOS].join(', ')}) só podem ser <strong>desativados</strong>,
          nunca eliminados ou ter a flag <em>terminal</em> alterada — o código depende destes
          códigos para lógicas como reabertura.
        </p>

        {adding && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Código (estável, MAIÚSCULAS)</Label>
                <Input
                  value={neu.codigo}
                  onChange={(e) => setNeu({ ...neu, codigo: e.target.value })}
                  placeholder="EM_RECURSO"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nome visível</Label>
                <Input
                  value={neu.nome}
                  onChange={(e) => setNeu({ ...neu, nome: e.target.value })}
                  placeholder="Em Recurso"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Descrição (opcional)</Label>
              <Textarea
                rows={2}
                value={neu.descricao}
                onChange={(e) => setNeu({ ...neu, descricao: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Ordem</Label>
                <Input
                  type="number"
                  min={0}
                  max={999}
                  value={neu.ordem}
                  onChange={(e) => setNeu({ ...neu, ordem: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cor</Label>
                <Select
                  value={neu.cor}
                  onValueChange={(v) => setNeu({ ...neu, cor: v ?? 'blue' })}
                >
                  <SelectTrigger>
                    <SelectValue>{(v: string) => v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADO_COR_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className={cn('inline-block w-3 h-3 rounded-full mr-2', ESTADO_COR_CLASSES[c])} />
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer mt-5">
                <input
                  type="checkbox"
                  checked={neu.terminal}
                  onChange={(e) => setNeu({ ...neu, terminal: e.target.checked })}
                  className="h-4 w-4 rounded border"
                />
                Estado terminal
              </label>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Criar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setAdding(false); setNeu(EMPTY_NEW) }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : estados.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Sem estados configurados.
          </p>
        ) : (
          <ul className="space-y-2">
            {estados.map((e) => {
              const isProtected = PROTECTED_ESTADO_CODIGOS.has(e.codigo)
              const isEditing = editId === e.id
              const corClass = e.cor ? ESTADO_COR_CLASSES[e.cor] ?? ESTADO_COR_DEFAULT : ESTADO_COR_DEFAULT
              return (
                <li
                  key={e.id}
                  className={cn(
                    'rounded-lg border p-3',
                    !e.ativo && 'opacity-60',
                  )}
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Código</Label>
                          <Input value={e.codigo} disabled className="font-mono opacity-60" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Nome</Label>
                          <Input
                            value={edit.nome}
                            onChange={(ev) => setEdit({ ...edit, nome: ev.target.value })}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Descrição</Label>
                        <Textarea
                          rows={2}
                          value={edit.descricao}
                          onChange={(ev) => setEdit({ ...edit, descricao: ev.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Ordem</Label>
                          <Input
                            type="number"
                            min={0}
                            max={999}
                            value={edit.ordem}
                            onChange={(ev) =>
                              setEdit({ ...edit, ordem: parseInt(ev.target.value) || 0 })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Cor</Label>
                          <Select
                            value={edit.cor ?? 'gray'}
                            onValueChange={(v) => setEdit({ ...edit, cor: v ?? null })}
                          >
                            <SelectTrigger>
                              <SelectValue>{(v: string) => v}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {ESTADO_COR_OPTIONS.map((c) => (
                                <SelectItem key={c} value={c}>
                                  <span className={cn('inline-block w-3 h-3 rounded-full mr-2', ESTADO_COR_CLASSES[c])} />
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <label
                          className={cn(
                            'flex items-center gap-2 text-sm mt-5',
                            isProtected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                          )}
                          title={isProtected ? 'Flag terminal protegida neste estado' : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={edit.terminal}
                            disabled={isProtected}
                            onChange={(ev) => setEdit({ ...edit, terminal: ev.target.checked })}
                            className="h-4 w-4 rounded border"
                          />
                          Estado terminal
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(e.id)}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Guardar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                          <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border', corClass)}>
                          {e.nome}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground">{e.codigo}</span>
                            <span className="text-xs text-muted-foreground">ordem: {e.ordem}</span>
                            {e.terminal && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                                terminal
                              </span>
                            )}
                            {isProtected && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                protegido
                              </span>
                            )}
                          </div>
                          {e.descricao && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.descricao}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleToggleAtivo(e)}
                          className={cn(
                            'text-xs px-2 py-1 rounded transition-colors',
                            e.ativo
                              ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400',
                          )}
                          title={e.ativo ? 'Desativar' : 'Ativar'}
                        >
                          {e.ativo ? 'Ativo' : 'Inativo'}
                        </button>
                        <button
                          onClick={() => startEdit(e)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(e)}
                          disabled={isProtected}
                          className={cn(
                            'p-1.5 rounded text-muted-foreground',
                            isProtected
                              ? 'opacity-30 cursor-not-allowed'
                              : 'hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30',
                          )}
                          title={isProtected ? 'Estado protegido — só pode ser desativado' : 'Eliminar'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
