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
import { ChevronLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect } from 'react'

const schema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').optional().or(z.literal('')),
  role: z.enum(['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO']),
  brigadaId: z.string().optional().nullable(),
  ativo: z.boolean(),
})

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
  const [brigadas, setBrigadas] = useState<{ id: string; nome: string }[]>([])

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
        if (Array.isArray(brigList)) setBrigadas(brigList)
        reset({
          nome: user.nome,
          email: user.email,
          password: '',
          role: user.role,
          brigadaId: user.brigadaId ?? '',
          ativo: user.ativo,
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

  async function handleDeactivate() {
    if (!confirm('Desactivar este utilizador?')) return

    const res = await fetch(`/api/utilizadores/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao desactivar')
      return
    }

    toast.success('Utilizador desactivado')
    router.push('/utilizadores')
    router.refresh()
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
                onClick={handleDeactivate}
              >
                Desactivar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
