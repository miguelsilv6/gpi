'use client'

import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, Loader2, Bell } from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { slugToNuipc, nuipcToSlug } from '@/lib/utils'

interface AtividadePadrao {
  nome: string
  temPrazo: boolean
  temQuantidade: boolean
}

const ALERT_OPTIONS = [
  { value: 1, label: '1 dia antes' },
  { value: 2, label: '2 dias antes' },
  { value: 5, label: '5 dias antes' },
  { value: 7, label: '1 semana antes' },
  { value: 15, label: '15 dias antes' },
  { value: 30, label: '1 mês antes' },
]

const schema = z.object({
  observacoes: z.string().max(2000).optional(),
  dataRealizacao: z.string().optional(),
  quantidade: z.number().int().min(1).optional(),
  dataPrazo: z.string().optional(),
  alertaDias1: z.number().int().optional(),
  alertaDias2: z.number().int().optional(),
})

type FormData = z.infer<typeof schema>

const quantSetValueAs = (v: unknown): number | undefined => {
  if (v === '' || v === null || v === undefined) return undefined
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

export default function EditarAtividadePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.nuipc as string
  const id = params.id as string
  const nuipc = slugToNuipc(slug)

  const [loading, setLoading] = useState(true)
  const [descricao, setDescricao] = useState('')
  const [padrao, setPadrao] = useState<AtividadePadrao | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const watchedAlerta1 = watch('alertaDias1')
  const [showAlerta2, setShowAlerta2] = useState(false)

  useEffect(() => {
    // Load atividade — we go through the inquérito GET which already includes
    // the atividades array, then find the one we're editing.
    Promise.all([
      fetch(`/api/inqueritos/${slug}`).then((r) => r.json()),
      fetch('/api/atividades-padrao').then((r) => r.json()),
    ])
      .then(([inq, padroes]) => {
        const atv = inq.atividades?.find((a: { id: string }) => a.id === id)
        if (!atv) {
          toast.error('Atividade não encontrada')
          router.push(`/inqueritos/${slug}`)
          return
        }
        setDescricao(atv.descricao)
        const p = Array.isArray(padroes)
          ? padroes.find((p: AtividadePadrao) => p.nome === atv.descricao) ?? null
          : null
        setPadrao(p)
        reset({
          observacoes: atv.observacoes ?? '',
          dataRealizacao: atv.dataRealizacao
            ? new Date(atv.dataRealizacao).toISOString().slice(0, 10)
            : '',
          quantidade: atv.quantidade ?? undefined,
          dataPrazo: atv.dataPrazo
            ? new Date(atv.dataPrazo).toISOString().slice(0, 10)
            : '',
          alertaDias1: atv.alertaDias1 ?? undefined,
          alertaDias2: atv.alertaDias2 ?? undefined,
        })
        setShowAlerta2(atv.alertaDias2 != null)
        setLoading(false)
      })
      .catch(() => {
        toast.error('Erro ao carregar atividade')
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, id])

  async function onSubmit(data: FormData) {
    const payload = {
      observacoes: data.observacoes?.trim() || null,
      dataRealizacao: data.dataRealizacao || undefined,
      quantidade: padrao?.temQuantidade ? (data.quantidade ?? null) : null,
      dataPrazo: padrao?.temPrazo ? (data.dataPrazo || null) : null,
      alertaDias1: padrao?.temPrazo ? (data.alertaDias1 ?? null) : null,
      alertaDias2:
        padrao?.temPrazo && showAlerta2 ? (data.alertaDias2 ?? null) : null,
    }

    const res = await fetch(`/api/atividades/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao guardar atividade')
      return
    }
    toast.success('Atividade atualizada')
    router.push(`/inqueritos/${nuipcToSlug(nuipc)}`)
    router.refresh()
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">A carregar...</div>
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <Link
          href={`/inqueritos/${nuipcToSlug(nuipc)}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ChevronLeft className="h-4 w-4" />
          {nuipc}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Editar Atividade</h1>
        <p className="text-muted-foreground text-sm">{descricao}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhes</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="dataRealizacao">Data de realização</Label>
              <Input id="dataRealizacao" type="date" {...register('dataRealizacao')} />
              <p className="text-xs text-muted-foreground">
                A atividade conta para a estatística do mês desta data.
              </p>
            </div>

            {padrao?.temQuantidade && (
              <div className="space-y-1.5">
                <Label htmlFor="quantidade">Quantidade</Label>
                <Input
                  id="quantidade"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  {...register('quantidade', { setValueAs: quantSetValueAs })}
                />
                {errors.quantidade && (
                  <p className="text-xs text-red-600">{errors.quantidade.message}</p>
                )}
              </div>
            )}

            {padrao?.temPrazo && (
              <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Bell className="h-4 w-4 text-orange-500" />
                  Prazo e alertas
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dataPrazo">Data limite</Label>
                  <Input id="dataPrazo" type="date" {...register('dataPrazo')} />
                </div>

                <div className="space-y-1.5">
                  <Label>1.º aviso</Label>
                  <Select
                    value={watch('alertaDias1') != null ? String(watch('alertaDias1')) : ''}
                    onValueChange={(v) =>
                      setValue('alertaDias1', v ? Number(v) : undefined, { shouldDirty: true })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sem aviso" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALERT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!showAlerta2 ? (
                  <button
                    type="button"
                    onClick={() => setShowAlerta2(true)}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    + Adicionar 2.º aviso (opcional)
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>2.º aviso (opcional)</Label>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAlerta2(false)
                          setValue('alertaDias2', undefined, { shouldDirty: true })
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Remover
                      </button>
                    </div>
                    <Select
                      value={watch('alertaDias2') != null ? String(watch('alertaDias2')) : ''}
                      onValueChange={(v) =>
                        setValue('alertaDias2', v ? Number(v) : undefined, { shouldDirty: true })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sem 2.º aviso" />
                      </SelectTrigger>
                      <SelectContent>
                        {ALERT_OPTIONS
                          .filter((o) => o.value !== watchedAlerta1)
                          .map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                rows={4}
                placeholder="Notas adicionais sobre esta atividade..."
                {...register('observacoes')}
              />
              {errors.observacoes && (
                <p className="text-xs text-red-600">{errors.observacoes.message}</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
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
