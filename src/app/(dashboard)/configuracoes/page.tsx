'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EstadosTab } from './estados-tab'

// ─── System config ────────────────────────────────────────────────────────────

const schema = z.object({
  prazoAlertaDias: z.number().int().min(1).max(365),
  backupScheduleCron: z.string().min(1),
  emailRemetenteNome: z.string().min(1),
  emailRemetenteAddr: z.string().email('Email inválido'),
})
type FormData = z.infer<typeof schema>

// ─── Atividade Padrão ─────────────────────────────────────────────────────────

interface AtividadePadrao {
  id: string
  nome: string
  descricao: string | null
  ativa: boolean
  ordem: number
  temPrazo: boolean
  temQuantidade: boolean
}

function AtividadesTab() {
  const [atividades, setAtividades] = useState<AtividadePadrao[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newDescricao, setNewDescricao] = useState('')
  const [newTemPrazo, setNewTemPrazo] = useState(false)
  const [newTemQuantidade, setNewTemQuantidade] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editDescricao, setEditDescricao] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/atividades-padrao')
    if (res.ok) setAtividades(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd() {
    if (!newNome.trim()) return
    setSaving(true)
    const res = await fetch('/api/atividades-padrao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: newNome.trim(),
        descricao: newDescricao.trim() || null,
        temPrazo: newTemPrazo,
        temQuantidade: newTemQuantidade,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao criar')
      return
    }
    toast.success('Atividade padrão criada')
    setNewNome('')
    setNewDescricao('')
    setNewTemPrazo(false)
    setNewTemQuantidade(false)
    setAdding(false)
    load()
  }

  async function handleToggleField(a: AtividadePadrao, field: 'ativa' | 'temPrazo' | 'temQuantidade') {
    const res = await fetch(`/api/atividades-padrao/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !a[field] }),
    })
    if (res.ok) {
      setAtividades((prev) => prev.map((x) => x.id === a.id ? { ...x, [field]: !x[field] } : x))
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/atividades-padrao/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setAtividades((prev) => prev.filter((x) => x.id !== id))
      toast.success('Removida')
    }
  }

  async function handleEdit(a: AtividadePadrao) {
    setEditId(a.id)
    setEditNome(a.nome)
    setEditDescricao(a.descricao ?? '')
  }

  async function handleEditSave(id: string) {
    if (!editNome.trim()) return
    const res = await fetch(`/api/atividades-padrao/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: editNome.trim(), descricao: editDescricao.trim() || null }),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao guardar')
      return
    }
    const updated = await res.json()
    setAtividades((prev) => prev.map((x) => x.id === id ? updated : x))
    setEditId(null)
    toast.success('Guardado')
  }

  if (loading) return <div className="text-sm text-muted-foreground py-4">A carregar...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Defina as atividades padrão. Os badges <span className="font-medium">Prazo</span> e <span className="font-medium">Qtd</span> ativam campos extra no registo.
          </p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nova atividade
          </Button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="newNome">Nome *</Label>
              <Input
                id="newNome"
                autoFocus
                placeholder="Ex: Recolha de depoimentos"
                value={newNome}
                onChange={(e) => setNewNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newDescricao">Descrição</Label>
              <Input
                id="newDescricao"
                placeholder="Descrição opcional"
                value={newDescricao}
                onChange={(e) => setNewDescricao(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newTemPrazo}
                  onChange={(e) => setNewTemPrazo(e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                <span>Tem prazo</span>
                <span className="text-xs text-muted-foreground">(mostra data limite e alertas)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newTemQuantidade}
                  onChange={(e) => setNewTemQuantidade(e.target.checked)}
                  className="h-4 w-4 rounded border"
                />
                <span>Tem quantidade</span>
                <span className="text-xs text-muted-foreground">(mostra campo numérico)</span>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleAdd} disabled={saving || !newNome.trim()}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Adicionar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                setAdding(false); setNewNome(''); setNewDescricao('')
                setNewTemPrazo(false); setNewTemQuantidade(false)
              }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {atividades.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhuma atividade padrão criada.
        </p>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-card">
          {atividades.map((a, i) => (
            <div
              key={a.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 transition-colors',
                i > 0 && 'border-t',
                !a.ativa && 'opacity-50',
              )}
            >
              {editId === a.id ? (
                <div className="flex-1 flex items-center gap-2 flex-wrap">
                  <Input
                    autoFocus
                    className="h-8 text-sm flex-1 min-w-[160px]"
                    value={editNome}
                    onChange={(e) => setEditNome(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEditSave(a.id)}
                  />
                  <Input
                    className="h-8 text-sm flex-1 min-w-[160px]"
                    placeholder="Descrição"
                    value={editDescricao}
                    onChange={(e) => setEditDescricao(e.target.value)}
                  />
                  <div className="flex gap-1">
                    <button onClick={() => handleEditSave(a.id)} className="p-1.5 rounded hover:bg-muted text-green-600"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setEditId(null)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{a.nome}</p>
                    {a.descricao && <p className="text-xs text-muted-foreground">{a.descricao}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                    {/* Prazo toggle */}
                    <button
                      onClick={() => handleToggleField(a, 'temPrazo')}
                      title="Clique para ativar/desativar prazo"
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                        a.temPrazo
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                          : 'bg-muted text-muted-foreground/60',
                      )}
                    >
                      Prazo
                    </button>
                    {/* Quantidade toggle */}
                    <button
                      onClick={() => handleToggleField(a, 'temQuantidade')}
                      title="Clique para ativar/desativar quantidade"
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                        a.temQuantidade
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                          : 'bg-muted text-muted-foreground/60',
                      )}
                    >
                      Qtd
                    </button>
                    {/* Ativa toggle */}
                    <button
                      onClick={() => handleToggleField(a, 'ativa')}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium transition-colors',
                        a.ativa
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {a.ativa ? 'Ativa' : 'Inativa'}
                    </button>
                    <button onClick={() => handleEdit(a)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded hover:bg-muted text-red-500 hover:text-red-700">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'sistema' | 'estados' | 'atividades'

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('sistema')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    fetch('/api/configuracoes')
      .then((r) => r.json())
      .then((d) => {
        reset({
          prazoAlertaDias: d.prazoAlertaDias,
          backupScheduleCron: d.backupScheduleCron,
          emailRemetenteNome: d.emailRemetenteNome,
          emailRemetenteAddr: d.emailRemetenteAddr,
        })
        setLoading(false)
      })
      .catch(() => {
        toast.error('Erro ao carregar configurações')
        setLoading(false)
      })
  }, [reset])

  async function onSubmit(data: FormData) {
    const res = await fetch('/api/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao guardar')
      return
    }
    toast.success('Configurações guardadas')
  }

  if (loading) return <div className="text-sm text-muted-foreground">A carregar...</div>

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground text-sm">Configurações do sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-0">
        {(['sistema', 'estados', 'atividades'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
              tab === t
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t === 'sistema' ? 'Sistema' : t === 'estados' ? 'Estados' : 'Atividades'}
          </button>
        ))}
      </div>

      {/* Sistema tab */}
      {tab === 'sistema' && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prazos e Alertas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="prazoAlertaDias">Alertar prazo com antecedência (dias)</Label>
                <Input
                  id="prazoAlertaDias"
                  type="number"
                  min={1}
                  max={365}
                  {...register('prazoAlertaDias')}
                />
                {errors.prazoAlertaDias && (
                  <p className="text-xs text-red-600">{errors.prazoAlertaDias.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Backups</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="backupScheduleCron">Agendamento (cron expression)</Label>
                <Input
                  id="backupScheduleCron"
                  {...register('backupScheduleCron')}
                  placeholder="0 2 * * *"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Ex: <code>0 2 * * *</code> = todos os dias às 02:00
                </p>
                {errors.backupScheduleCron && (
                  <p className="text-xs text-red-600">{errors.backupScheduleCron.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email do sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="emailRemetenteNome">Nome do remetente</Label>
                <Input id="emailRemetenteNome" {...register('emailRemetenteNome')} />
                {errors.emailRemetenteNome && (
                  <p className="text-xs text-red-600">{errors.emailRemetenteNome.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emailRemetenteAddr">Endereço de remetente</Label>
                <Input id="emailRemetenteAddr" type="email" {...register('emailRemetenteAddr')} />
                {errors.emailRemetenteAddr && (
                  <p className="text-xs text-red-600">{errors.emailRemetenteAddr.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar configurações
          </Button>
        </form>
      )}

      {/* Estados tab */}
      {tab === 'estados' && <EstadosTab />}

      {/* Atividades tab */}
      {tab === 'atividades' && <AtividadesTab />}
    </div>
  )
}
