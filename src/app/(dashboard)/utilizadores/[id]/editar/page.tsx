'use client'

import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes-warning'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, Loader2, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog'

const schema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').optional().or(z.literal('')),
  role: z.enum(['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO']),
  brigadaId: z.string().optional().nullable(),
  ativo: z.boolean(),
  lt: z.number().int().positive('LT deve ser um número positivo').optional(),
  telemovel: z.string().trim().max(40).optional().or(z.literal('')),
})

const ltSetValueAs = (v: unknown): number | undefined => {
  if (v === '' || v === null || v === undefined) return undefined
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

type FormData = z.infer<typeof schema>

const ROLE_LABELS: Record<string, string> = {
  INSPETOR: 'Inspetor',
  INSPETOR_CHEFE: 'Inspetor-Chefe',
  COORDENADOR: 'Coordenador',
  ESTATISTICA: 'Estatística',
  ADMINISTRACAO: 'Administração',
}

export default function EditarUtilizadorPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [brigadas, setBrigadas] = useState<{ id: string; nome: string }[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  useUnsavedChangesWarning(isDirty && !isSubmitting && !isSubmitSuccessful)

  watch('role')

  useEffect(() => {
    Promise.all([
      fetch(`/api/utilizadores/${id}`).then((r) => r.json()),
      fetch('/api/brigadas').then((r) => r.json()),
    ])
      .then(([user, brigList]) => {
        setUserName(user.nome)
        setUserEmail(user.email)
        if (Array.isArray(brigList)) setBrigadas(brigList)
        reset({
          nome: user.nome,
          email: user.email,
          password: '',
          role: user.role,
          brigadaId: user.brigadaId ?? '',
          ativo: user.ativo,
          lt: user.lt ?? undefined,
          telemovel: user.telemovel ?? '',
        })
        setLoading(false)
      })
      .catch(() => {
        toast.error('Erro ao carregar dados')
        setLoading(false)
      })
  }, [id, reset])

  async function onSubmit(data: FormData) {
    const payload = {
      ...data,
      password: data.password || undefined,
      brigadaId: data.brigadaId || null,
      lt: data.lt ?? null,
      telemovel: data.telemovel?.trim() || null,
    }

    const res = await fetch(`/api/utilizadores/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao guardar')
      return
    }

    toast.success('Utilizador actualizado')
    router.push('/utilizadores')
    router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/utilizadores/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao eliminar utilizador')
        setDeleting(false)
        return
      }
      const body = await res.json().catch(() => ({}))
      if (body.deactivated) {
        toast.success(
          'Utilizador tinha histórico associado — foi desativado (deixa de poder entrar). O histórico fica preservado.',
        )
      } else {
        toast.success('Utilizador eliminado')
      }
      setDeleteOpen(false)
      router.push('/utilizadores')
      router.refresh()
    } catch {
      toast.error('Erro de rede ao eliminar utilizador')
      setDeleting(false)
    }
  }

  if (loading) return <div className="text-muted-foreground text-sm">A carregar...</div>

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <Link
          href="/utilizadores"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ChevronLeft className="h-4 w-4" />
          Utilizadores
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Editar Utilizador</h1>
        <p className="text-muted-foreground text-sm">{userName}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do utilizador</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" {...register('nome')} />
              {errors.nome && <p className="text-xs text-red-600">{errors.nome.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lt">N.º de LT</Label>
                <Input
                  id="lt"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="Único"
                  {...register('lt', { setValueAs: ltSetValueAs })}
                />
                {errors.lt && <p className="text-xs text-red-600">{errors.lt.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="telemovel">Telemóvel</Label>
                <Input
                  id="telemovel"
                  type="tel"
                  placeholder="912 345 678"
                  {...register('telemovel')}
                />
                {errors.telemovel && <p className="text-xs text-red-600">{errors.telemovel.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Nova password</Label>
              <Input id="password" type="password" {...register('password')} placeholder="Deixar em branco para não alterar" />
              {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role">Perfil *</Label>
              <select
                id="role"
                {...register('role')}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brigadaId">Brigada</Label>
              <select
                id="brigadaId"
                {...register('brigadaId')}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Sem brigada</option>
                {brigadas.map((b) => (
                  <option key={b.id} value={b.id}>{b.nome}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ativo"
                {...register('ativo')}
                className="h-4 w-4 rounded border"
              />
              <Label htmlFor="ativo">Conta activa</Label>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-3">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar
                </Button>
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Cancelar
                </Button>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminar utilizador"
        entityLabel={`${userName} <${userEmail}>`}
        description="Se o utilizador não tiver histórico associado (atividades, inquéritos atribuídos), é eliminado por completo. Caso contrário, é apenas desativado — deixa de poder iniciar sessão e as sessões activas são revogadas, mas o histórico permanece intacto para fins legais."
        confirmToken={userEmail}
        inputLabel="Para confirmar, digite o email"
        destructiveLabel="Eliminar utilizador"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
