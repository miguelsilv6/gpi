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
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

const schema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).optional(),
})

type FormData = z.infer<typeof schema>

export default function NovaBrigadaPage() {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  useUnsavedChangesWarning(isDirty && !isSubmitting && !isSubmitSuccessful)

  async function onSubmit(data: FormData) {
    const res = await fetch('/api/brigadas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao criar brigada')
      return
    }

    toast.success('Brigada criada com sucesso')
    router.push('/brigadas')
    router.refresh()
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <Link
          href="/brigadas"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ChevronLeft className="h-4 w-4" />
          Brigadas
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nova Brigada</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da brigada</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" {...register('nome')} placeholder="Ex: Brigada Alpha" />
              {errors.nome && (
                <p className="text-xs text-red-600">{errors.nome.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                {...register('descricao')}
                rows={3}
                placeholder="Descrição opcional..."
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Brigada
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
