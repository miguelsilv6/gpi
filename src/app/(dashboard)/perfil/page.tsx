'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes-warning'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, User, Shield, Building2, KeyRound, Calculator, Car, Pencil, Plus, Trash2, Bell, Save, ListFilter, List, Compass } from 'lucide-react'
import { START_TOUR_EVENT } from '@/lib/tour-steps'
import { INQUERITO_PAGE_SIZES, DEFAULT_INQUERITO_PAGE_SIZE } from '@/lib/pagination'
import { ROLE_LABELS } from '@/lib/rbac'
import { NOTIFICATION_TIPO_LABELS, NOTIFICATION_TIPO_DESCRIPTIONS } from '@/lib/notification-labels'
import { PushToggle } from '@/components/push/push-toggle'
import type { Role } from '@/generated/prisma/enums'

interface ViaturaItem { id: string; nome: string; matricula: string | null }

function ViaturasList() {
  const [viaturas, setViaturas] = useState<ViaturaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [matricula, setMatricula] = useState('')
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    fetch('/api/viaturas')
      .then((r) => r.json())
      .then((d) => { setViaturas(d); setLoading(false) })
      .catch(() => { toast.error('Erro ao carregar viaturas'); setLoading(false) })
  }, [])

  function startAdd() { setEditingId(null); setNome(''); setMatricula(''); setAdding(true) }
  function startEdit(v: ViaturaItem) { setEditingId(v.id); setNome(v.nome); setMatricula(v.matricula ?? ''); setAdding(false) }
  function cancelEdit() { setEditingId(null); setAdding(false) }

  async function handleSave() {
    if (!nome.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    try {
      const body = { nome: nome.trim(), matricula: matricula.trim() || null }
      let res: Response
      if (editingId) {
        res = await fetch(`/api/viaturas/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        res = await fetch('/api/viaturas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      if (!res.ok) { const e = await res.json(); toast.error(e.error ?? 'Erro ao guardar'); return }
      const saved: ViaturaItem = await res.json()
      setViaturas((prev) => editingId ? prev.map((v) => v.id === editingId ? saved : v) : [...prev, saved])
      cancelEdit()
      toast.success(editingId ? 'Viatura atualizada' : 'Viatura adicionada')
    } catch { toast.error('Erro ao guardar') } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminar esta viatura?')) return
    try {
      const res = await fetch(`/api/viaturas/${id}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json(); toast.error(e.error ?? 'Erro ao eliminar'); return }
      setViaturas((prev) => prev.filter((v) => v.id !== id))
      toast.success('Viatura eliminada')
    } catch { toast.error('Erro ao eliminar') }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
          <Car className="h-4 w-4" />
          As minhas Viaturas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-xs text-muted-foreground">A carregar...</p>
        ) : (
          <>
            {viaturas.length === 0 && !adding && (
              <p className="text-xs text-muted-foreground">Nenhuma viatura. Adicione para usar nas ajudas mensais.</p>
            )}
            <div className="space-y-1.5">
              {viaturas.map((v) => (
                <div key={v.id} className="text-sm">
                  {editingId === v.id ? (
                    <div className="flex gap-2 items-start">
                      <Input className="h-7 text-xs" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome *" />
                      <Input className="h-7 text-xs w-32" value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Matrícula" />
                      <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>Guardar</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>Cancelar</Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between py-1 border-b last:border-0">
                      <span>{v.nome}{v.matricula && <span className="ml-2 text-muted-foreground text-xs">{v.matricula}</span>}</span>
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(v)} className="p-1 hover:text-foreground text-muted-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => handleDelete(v.id)} className="p-1 hover:text-red-600 text-muted-foreground"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {adding ? (
              <div className="flex gap-2 items-start pt-1">
                <Input className="h-7 text-xs" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome *" autoFocus />
                <Input className="h-7 text-xs w-32" value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Matrícula" />
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>Guardar</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>Cancelar</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={startAdd}>
                <Plus className="h-3.5 w-3.5 mr-1" />Adicionar viatura
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Notification email preferences sub-component ─────────────────────────────

interface PreferenciaItem {
  tipo: string
  emailEnabled: boolean
}

function NotificacoesPreferencias() {
  const [prefs, setPrefs] = useState<PreferenciaItem[]>([])
  const [original, setOriginal] = useState<PreferenciaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/notificacoes/preferencias')
      .then((r) => r.json())
      .then((d) => {
        setPrefs(d.preferencias ?? [])
        setOriginal(d.preferencias ?? [])
        setLoading(false)
      })
      .catch(() => {
        toast.error('Erro ao carregar preferências de notificação')
        setLoading(false)
      })
  }, [])

  const isDirty = prefs.some((p) => {
    const orig = original.find((o) => o.tipo === p.tipo)
    return orig ? p.emailEnabled !== orig.emailEnabled : false
  })

  function toggle(tipo: string) {
    setPrefs((prev) => prev.map((p) => (p.tipo === tipo ? { ...p, emailEnabled: !p.emailEnabled } : p)))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/notificacoes/preferencias', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferencias: prefs }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        toast.error(e.error ?? 'Erro ao guardar')
        return
      }
      setOriginal(prefs)
      toast.success('Preferências guardadas')
    } catch {
      toast.error('Erro ao guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
          <Bell className="h-4 w-4" />
          Notificações por email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Escolha que tipos de notificação quer receber por email. As notificações na
          aplicação continuam sempre disponíveis.
        </p>
        {loading ? (
          <div className="text-sm text-muted-foreground py-2">A carregar...</div>
        ) : (
          <>
            <div className="rounded-xl border divide-y">
              {prefs.map((p) => (
                <label
                  key={p.tipo}
                  className="flex items-start justify-between gap-3 px-3 py-2.5 cursor-pointer select-none"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {NOTIFICATION_TIPO_LABELS[p.tipo as keyof typeof NOTIFICATION_TIPO_LABELS] ?? p.tipo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {NOTIFICATION_TIPO_DESCRIPTIONS[p.tipo as keyof typeof NOTIFICATION_TIPO_DESCRIPTIONS]}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={p.emailEnabled}
                    onChange={() => toggle(p.tipo)}
                    className="mt-0.5 h-4 w-4 rounded border shrink-0"
                  />
                </label>
              ))}
            </div>
            <Button size="sm" onClick={handleSave} disabled={!isDirty || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const profileSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  email: z.string().email('Email inválido'),
})

const passwordSchema = z.object({
  passwordAtual: z.string().min(1, 'Obrigatório'),
  passwordNova: z.string().min(8, 'Mínimo 8 caracteres'),
  passwordConfirmar: z.string().min(1, 'Obrigatório'),
}).refine((d) => d.passwordNova === d.passwordConfirmar, {
  message: 'As passwords não coincidem',
  path: ['passwordConfirmar'],
})

type ProfileData = z.infer<typeof profileSchema>
type PasswordData = z.infer<typeof passwordSchema>

interface EstadoOption {
  codigo: string
  nome: string
  cor: string | null
}

interface UserProfile {
  id: string
  nome: string
  email: string
  role: Role
  brigada: { id: string; nome: string } | null
  ajudasVencimentoBase: number | null
  ajudasTaxaIRS: number | null
  moduloAjudasAtivo: boolean
  inqueritoFiltroEstadosDefault: string[]
  inqueritoPageSizeDefault: number | null
  estadosDisponiveis: EstadoOption[]
}

export default function PerfilPage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [ajudasVencimento, setAjudasVencimento] = useState<string>('')
  const [ajudasIRS, setAjudasIRS] = useState<string>('')
  const [savingAjudas, setSavingAjudas] = useState(false)
  const [filtroEstados, setFiltroEstados] = useState<string[]>([])
  const [filtroEstadosOriginal, setFiltroEstadosOriginal] = useState<string[]>([])
  const [savingFiltros, setSavingFiltros] = useState(false)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_INQUERITO_PAGE_SIZE)
  const [pageSizeOriginal, setPageSizeOriginal] = useState<number>(DEFAULT_INQUERITO_PAGE_SIZE)
  const [savingPageSize, setSavingPageSize] = useState(false)

  const profileForm = useForm<ProfileData>({ resolver: zodResolver(profileSchema) })
  const passwordForm = useForm<PasswordData>({ resolver: zodResolver(passwordSchema) })

  useUnsavedChangesWarning(
    (profileForm.formState.isDirty && !profileForm.formState.isSubmitting && !profileForm.formState.isSubmitSuccessful) ||
      (passwordForm.formState.isDirty && !passwordForm.formState.isSubmitting && !passwordForm.formState.isSubmitSuccessful),
  )

  useEffect(() => {
    fetch('/api/perfil')
      .then((r) => r.json())
      .then((data) => {
        setUser(data)
        profileForm.reset({ nome: data.nome, email: data.email })
        setAjudasVencimento(data.ajudasVencimentoBase != null ? String(data.ajudasVencimentoBase) : '')
        // Store IRS as percentage for display (DB stores decimal, e.g. 0.1116 → "11.16")
        setAjudasIRS(data.ajudasTaxaIRS != null ? String(+(data.ajudasTaxaIRS * 100).toFixed(4)) : '')
        setFiltroEstados(data.inqueritoFiltroEstadosDefault ?? [])
        setFiltroEstadosOriginal(data.inqueritoFiltroEstadosDefault ?? [])
        setPageSize(data.inqueritoPageSizeDefault ?? DEFAULT_INQUERITO_PAGE_SIZE)
        setPageSizeOriginal(data.inqueritoPageSizeDefault ?? DEFAULT_INQUERITO_PAGE_SIZE)
        setLoading(false)
      })
      .catch(() => {
        toast.error('Erro ao carregar perfil')
        setLoading(false)
      })
  }, [profileForm])

  async function onProfileSubmit(data: ProfileData) {
    // O campo email está desativado no formulário para quem não é
    // administrador — não o enviar evita que o PUT seja rejeitado só por
    // reenviar o valor (inalterado) que já estava na BD.
    const { email, ...rest } = data
    const payload = user?.role === 'ADMINISTRACAO' ? data : rest
    const res = await fetch('/api/perfil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao actualizar perfil')
      return
    }
    const updated = await res.json()
    setUser((prev) => prev ? { ...prev, ...updated } : prev)
    profileForm.reset({ nome: updated.nome, email: updated.email })
    toast.success('Perfil actualizado')
  }

  async function onPasswordSubmit(data: PasswordData) {
    const res = await fetch('/api/perfil', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passwordAtual: data.passwordAtual, passwordNova: data.passwordNova }),
    })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao alterar password')
      return
    }
    toast.success('Password alterada com sucesso')
    passwordForm.reset()
  }

  async function onAjudasSave() {
    setSavingAjudas(true)
    try {
      const payload: Record<string, number | null> = {
        ajudasVencimentoBase: ajudasVencimento !== '' ? parseFloat(ajudasVencimento) : null,
        // User enters percentage (e.g. 11.16), convert back to decimal for storage
        ajudasTaxaIRS: ajudasIRS !== '' ? parseFloat(ajudasIRS) / 100 : null,
      }
      if (
        (payload.ajudasVencimentoBase !== null && isNaN(payload.ajudasVencimentoBase as number)) ||
        (payload.ajudasTaxaIRS !== null && isNaN(payload.ajudasTaxaIRS as number))
      ) {
        toast.error('Valores inválidos')
        return
      }
      const res = await fetch('/api/perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      const updated = await res.json()
      setUser((prev) => prev ? { ...prev, ...updated } : prev)
      toast.success('Configuração de ajudas guardada')
    } catch {
      toast.error('Erro ao guardar')
    } finally {
      setSavingAjudas(false)
    }
  }

  function toggleFiltroEstado(codigo: string) {
    setFiltroEstados((prev) =>
      prev.includes(codigo) ? prev.filter((c) => c !== codigo) : [...prev, codigo],
    )
  }

  const filtrosDirty =
    [...filtroEstados].sort().join(',') !== [...filtroEstadosOriginal].sort().join(',')

  async function onFiltrosSave() {
    setSavingFiltros(true)
    try {
      const res = await fetch('/api/perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inqueritoFiltroEstadosDefault: filtroEstados }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      const updated = await res.json()
      const saved: string[] = updated.inqueritoFiltroEstadosDefault ?? filtroEstados
      setFiltroEstados(saved)
      setFiltroEstadosOriginal(saved)
      setUser((prev) => (prev ? { ...prev, inqueritoFiltroEstadosDefault: saved } : prev))
      toast.success('Filtro de estados guardado')
    } catch {
      toast.error('Erro ao guardar')
    } finally {
      setSavingFiltros(false)
    }
  }

  const pageSizeDirty = pageSize !== pageSizeOriginal

  async function onPageSizeSave() {
    setSavingPageSize(true)
    try {
      const res = await fetch('/api/perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inqueritoPageSizeDefault: pageSize }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      const updated = await res.json()
      const saved: number = updated.inqueritoPageSizeDefault ?? pageSize
      setPageSize(saved)
      setPageSizeOriginal(saved)
      setUser((prev) => (prev ? { ...prev, inqueritoPageSizeDefault: saved } : prev))
      toast.success('Inquéritos por página guardado')
    } catch {
      toast.error('Erro ao guardar')
    } finally {
      setSavingPageSize(false)
    }
  }

  if (loading) return <div className="text-muted-foreground text-sm">A carregar...</div>
  if (!user) return null

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Perfil</h1>
        <p className="text-muted-foreground text-sm">Gerir as suas informações pessoais</p>
      </div>

      {/* Role & Brigade info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            Conta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Perfil</span>
            <span className="font-medium">{ROLE_LABELS[user.role]}</span>
          </div>
          {user.brigada && (
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" /> Brigada
              </span>
              <span className="font-medium">{user.brigada.nome}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile info edit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <User className="h-4 w-4" />
            Informações pessoais
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" {...profileForm.register('nome')} />
              {profileForm.formState.errors.nome && (
                <p className="text-xs text-red-600">{profileForm.formState.errors.nome.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                disabled={user.role !== 'ADMINISTRACAO'}
                {...profileForm.register('email')}
              />
              {profileForm.formState.errors.email && (
                <p className="text-xs text-red-600">{profileForm.formState.errors.email.message}</p>
              )}
              {user.role !== 'ADMINISTRACAO' && (
                <p className="text-xs text-muted-foreground">
                  Apenas o administrador pode alterar o email. Contacte o administrador do sistema.
                </p>
              )}
            </div>
            <Button type="submit" disabled={profileForm.formState.isSubmitting} size="sm">
              {profileForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Ajudas Mensais settings — só visível com o módulo ativo */}
      {user.moduloAjudasAtivo && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
              <Calculator className="h-4 w-4" />
              Ajudas Mensais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Ambos os campos são obrigatórios para ativar o cálculo das ajudas. O <strong>Vencimento Base</strong> é o seu salário base pessoal e define o limite mensal individual (1/3 do vencimento). A <strong>Taxa de IRS</strong> é a sua taxa de retenção.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="ajudasVencimento">Vencimento Base (€)</Label>
              <Input
                id="ajudasVencimento"
                type="number"
                step="0.01"
                min={0}
                placeholder="ex: 1974.41"
                value={ajudasVencimento}
                onChange={(e) => setAjudasVencimento(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ajudasIRS">Taxa de Retenção de IRS (%)</Label>
              <Input
                id="ajudasIRS"
                type="number"
                step="0.01"
                min={0}
                max={100}
                placeholder="ex: 11.16"
                value={ajudasIRS}
                onChange={(e) => setAjudasIRS(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={onAjudasSave} disabled={savingAjudas}>
              {savingAjudas && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filtro de estados pré-definido na pesquisa de inquéritos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <ListFilter className="h-4 w-4" />
            Filtro de estados (Inquéritos)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Estados pré-selecionados por defeito ao abrir a pesquisa de inquéritos. Se não
            escolher nenhum, é usado o filtro padrão definido pelo administrador.
          </p>
          {user.estadosDisponiveis.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum estado disponível.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {user.estadosDisponiveis.map((e) => {
                const active = filtroEstados.includes(e.codigo)
                return (
                  <button
                    key={e.codigo}
                    type="button"
                    onClick={() => toggleFiltroEstado(e.codigo)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input hover:bg-accent'
                    }`}
                  >
                    {e.cor && (
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: e.cor }}
                      />
                    )}
                    {e.nome}
                  </button>
                )
              })}
            </div>
          )}
          <Button size="sm" onClick={onFiltrosSave} disabled={!filtrosDirty || savingFiltros}>
            {savingFiltros ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar
          </Button>
        </CardContent>
      </Card>

      {/* Nº de inquéritos por página (default pessoal na listagem) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <List className="h-4 w-4" />
            Inquéritos por página
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Número de inquéritos mostrados por página, por defeito, na listagem.
            Pode sempre alterá-lo pontualmente no seletor no fundo da lista.
          </p>
          <Select value={String(pageSize)} onValueChange={(v) => v && setPageSize(Number(v))}>
            <SelectTrigger className="w-32">
              {/* value === label (o número) ⇒ o valor cru já é o texto certo. */}
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INQUERITO_PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div>
            <Button size="sm" onClick={onPageSizeSave} disabled={!pageSizeDirty || savingPageSize}>
              {savingPageSize ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Viaturas */}
      <ViaturasList />

      {/* Notification email preferences */}
      <NotificacoesPreferencias />

      {/* Push notifications (per device) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <Bell className="h-4 w-4" />
            Notificações push
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PushToggle />
        </CardContent>
      </Card>

      {/* Password change */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <KeyRound className="h-4 w-4" />
            Alterar password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="passwordAtual">Password atual</Label>
              <Input id="passwordAtual" type="password" {...passwordForm.register('passwordAtual')} />
              {passwordForm.formState.errors.passwordAtual && (
                <p className="text-xs text-red-600">{passwordForm.formState.errors.passwordAtual.message}</p>
              )}
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="passwordNova">Nova password</Label>
              <Input id="passwordNova" type="password" {...passwordForm.register('passwordNova')} />
              {passwordForm.formState.errors.passwordNova && (
                <p className="text-xs text-red-600">{passwordForm.formState.errors.passwordNova.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="passwordConfirmar">Confirmar nova password</Label>
              <Input id="passwordConfirmar" type="password" {...passwordForm.register('passwordConfirmar')} />
              {passwordForm.formState.errors.passwordConfirmar && (
                <p className="text-xs text-red-600">{passwordForm.formState.errors.passwordConfirmar.message}</p>
              )}
            </div>
            <Button type="submit" disabled={passwordForm.formState.isSubmitting} size="sm" variant="outline">
              {passwordForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Alterar password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <Compass className="h-4 w-4" />
            Visita guiada
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Uma visita rápida pelas principais funcionalidades da aplicação, adaptada ao teu
            perfil. Mostra-se automaticamente no primeiro acesso — aqui podes voltar a vê-la
            quando quiseres.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.dispatchEvent(new Event(START_TOUR_EVENT))}
          >
            <Compass className="mr-2 h-4 w-4" />
            Ver visita guiada
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
