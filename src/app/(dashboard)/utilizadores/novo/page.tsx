'use client'

import { useRouter } from 'next/navigation'
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
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  role: z.enum(['INSPETOR', 'INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO']),
  brigadaId: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const ROLE_LABELS: Record<string, string> = {
  INSPETOR: 'Inspetor',
  INSPETOR_CHEFE: 'Inspetor-Chefe',
  COORDENADOR: 'Coordenador',
  ESTATISTICA: 'Estatística',
  ADMINISTRACAO: 'Administração',
}

export default function NovoUtilizadorPage() {
  const router = useRouter()
  const [brigadas, setBrigadas] = useState<{ id: string; nome: string }[]>([])

  useEffect(() => {
    fetch('/api/brigadas')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setBrigadas(d))
      .catch(() => {})
  }, [])

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'INSPETOR' },
  })

  useUnsavedChangesWarning(isDirty && !isSubmitting && !isSubmitSuccessful)

  watch('role')

  async function onSubmit(data: FormData) {
    const res = await fetch('/api/utilizadores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao criar utilizador')
      return
    }

    toast.success('Utilizador criado com sucesso')
    router.push('/utilizadores')
    router.refresh()
  }

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
        <h1 className="text-2xl font-bold tracking-tight">Novo Utilizador</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do utilizador</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" {...register('nome')} placeholder="Nome completo" />
              {errors.nome && <p className="text-xs text-red-600">{errors.nome.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" {...register('email')} placeholder="utilizador@gpi.pt" />
              {errors.email && <p className="text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password *</Label>
              <Input id="password" type="password" {...register('password')} placeholder="Mínimo 8 caracteres" />
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

            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Utilizador
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
