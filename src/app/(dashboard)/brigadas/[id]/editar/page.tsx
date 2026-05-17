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
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronLeft, Loader2, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect } from 'react'

const schema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).optional(),
  ativa: z.boolean(),
})

type FormData = z.infer<typeof schema>

export default function EditarBrigadaPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [loading, setLoading] = useState(true)
  const [brigadaNome, setBrigadaNome] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  useUnsavedChangesWarning(isDirty && !isSubmitting && !isSubmitSuccessful)

  useEffect(() => {
    fetch(`/api/brigadas/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setBrigadaNome(d.nome)
        reset({ nome: d.nome, descricao: d.descricao ?? '', ativa: d.ativa })
        setLoading(false)
      })
      .catch(() => {
        toast.error('Erro ao carregar brigada')
        setLoading(false)
      })
  }, [id, reset])

  async function onSubmit(data: FormData) {
    const res = await fetch(`/api/brigadas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao guardar')
      return
    }

    toast.success('Brigada actualizada')
    router.push('/brigadas')
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm('Eliminar brigada? Esta acção é irreversível.')) return

    const res = await fetch(`/api/brigadas/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao eliminar')
      return
    }

    toast.success('Brigada eliminada')
    router.push('/brigadas')
    router.refresh()
  }

  if (loading) return <div className="text-muted-foreground text-sm">A carregar...</div>

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
        <h1 className="text-2xl font-bold tracking-tight">Editar Brigada</h1>
        <p className="text-muted-foreground text-sm">{brigadaNome}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da brigada</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" {...register('nome')} />
              {errors.nome && (
                <p className="text-xs text-red-600">{errors.nome.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea id="descricao" {...register('descricao')} rows={3} />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ativa"
                {...register('ativa')}
                className="h-4 w-4 rounded border"
              />
              <Label htmlFor="ativa">Brigada activa</Label>
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
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Eliminar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
