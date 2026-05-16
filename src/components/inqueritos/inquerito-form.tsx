'use client'

import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { inqueritoSchema, type InqueritoFormData } from '@/lib/validations/inquerito'
import { ESTADO_LABELS, FASE_LABELS } from '@/lib/constants'
import { nuipcToSlug } from '@/lib/utils'
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes-warning'
import { Loader2 } from 'lucide-react'

interface Brigada { id: string; nome: string }
interface Inspetor { id: string; nome: string; brigadaId: string | null }

interface InqueritoFormProps {
  defaultValues?: Partial<InqueritoFormData>
  brigadas: Brigada[]
  inspetores: Inspetor[]
  nuipcOriginal?: string
  mode: 'create' | 'edit'
}

export function InqueritoForm({
  defaultValues,
  brigadas,
  inspetores,
  nuipcOriginal,
  mode,
}: InqueritoFormProps) {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<InqueritoFormData>({
    resolver: zodResolver(inqueritoSchema),
    defaultValues: {
      estado: 'ABERTO',
      faseProcessual: 'INQUERITO',
      ...defaultValues,
    },
  })

  useUnsavedChangesWarning(isDirty && !isSubmitting && !isSubmitSuccessful)

  async function onSubmit(data: InqueritoFormData) {
    const url =
      mode === 'create'
        ? '/api/inqueritos'
        : `/api/inqueritos/${nuipcOriginal ? nuipcToSlug(nuipcOriginal) : ''}`
    const method = mode === 'create' ? 'POST' : 'PUT'

    // Empty strings (from "Não atribuído" or after a brigada change) must become null
    const payload = {
      ...data,
      inspetorId: data.inspetorId && data.inspetorId.length > 0 ? data.inspetorId : null,
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao guardar inquérito')
      return
    }

    const inquerito = await res.json()
    toast.success(mode === 'create' ? 'Inquérito criado' : 'Inquérito atualizado')
    router.push(`/inqueritos/${nuipcToSlug(inquerito.nuipc)}`)
    router.refresh()
  }

  const selectedBrigadaId = watch('brigadaId')
  const selectedInspetorId = watch('inspetorId')

  const filteredInspetores = useMemo(
    () => inspetores.filter((i) => i.brigadaId === selectedBrigadaId),
    [inspetores, selectedBrigadaId],
  )

  // When brigada changes, clear inspetorId if the current inspetor doesn't belong to it
  useEffect(() => {
    if (!selectedInspetorId) return
    const stillValid = filteredInspetores.some((i) => i.id === selectedInspetorId)
    if (!stillValid) {
      setValue('inspetorId', '', { shouldDirty: true })
    }
  }, [selectedBrigadaId, selectedInspetorId, filteredInspetores, setValue])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identificação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nuipc">NUIPC *</Label>
              <Input
                id="nuipc"
                placeholder="2024/000001/YUSTR"
                className="font-mono"
                {...register('nuipc')}
              />
              {errors.nuipc && (
                <p className="text-xs text-red-600">{errors.nuipc.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nai">NAI</Label>
              <Input
                id="nai"
                placeholder="Número de auto de inquérito"
                className="font-mono"
                {...register('nai')}
              />
              {errors.nai && (
                <p className="text-xs text-red-600">{errors.nai.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dataAbertura">Data de abertura *</Label>
              <Input id="dataAbertura" type="date" {...register('dataAbertura')} />
              {errors.dataAbertura && (
                <p className="text-xs text-red-600">{errors.dataAbertura.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="natureza">Natureza do crime *</Label>
            <Input
              id="natureza"
              placeholder="Ex: Furto qualificado, Tráfico de estupefacientes..."
              {...register('natureza')}
            />
            {errors.natureza && (
              <p className="text-xs text-red-600">{errors.natureza.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado e Fase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Estado *</Label>
              <Select
                defaultValue={defaultValues?.estado ?? 'ABERTO'}
                onValueChange={(v) => setValue('estado', v as InqueritoFormData['estado'])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar estado">
                    {(v: string) =>
                      ESTADO_LABELS[v as keyof typeof ESTADO_LABELS] ?? 'Selecionar estado'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ESTADO_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.estado && (
                <p className="text-xs text-red-600">{errors.estado.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Fase processual *</Label>
              <Select
                defaultValue={defaultValues?.faseProcessual ?? 'INQUERITO'}
                onValueChange={(v) => setValue('faseProcessual', v as InqueritoFormData['faseProcessual'])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar fase">
                    {(v: string) =>
                      FASE_LABELS[v as keyof typeof FASE_LABELS] ?? 'Selecionar fase'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FASE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.faseProcessual && (
                <p className="text-xs text-red-600">{errors.faseProcessual.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dataPrazo">Prazo</Label>
              <Input id="dataPrazo" type="date" {...register('dataPrazo')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dataConclusao">Data de conclusão</Label>
              <Input id="dataConclusao" type="date" {...register('dataConclusao')} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atribuição</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Brigada *</Label>
              <Select
                value={selectedBrigadaId || ''}
                onValueChange={(v) => setValue('brigadaId', v ?? '', { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar brigada">
                    {(v: string) =>
                      brigadas.find((b) => b.id === v)?.nome ?? 'Selecionar brigada'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {brigadas.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.brigadaId && (
                <p className="text-xs text-red-600">{errors.brigadaId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Inspetor atribuído</Label>
              <Select
                value={selectedInspetorId || 'none'}
                onValueChange={(v) => setValue('inspetorId', v === 'none' ? '' : (v ?? ''), { shouldDirty: true })}
                disabled={!selectedBrigadaId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedBrigadaId ? 'Não atribuído' : 'Selecione primeiro a brigada'}>
                    {(v: string) => {
                      if (!selectedBrigadaId) return 'Selecione primeiro a brigada'
                      if (!v || v === 'none') return 'Não atribuído'
                      return filteredInspetores.find((i) => i.id === v)?.nome ?? 'Não atribuído'
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não atribuído</SelectItem>
                  {filteredInspetores.length === 0 ? (
                    <SelectItem value="__empty" disabled>
                      Sem inspetores nesta brigada
                    </SelectItem>
                  ) : (
                    filteredInspetores.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedBrigadaId && filteredInspetores.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Não há inspetores activos atribuídos a esta brigada.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notas</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Observações adicionais..."
            rows={4}
            {...register('notas')}
          />
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'create' ? 'Criar inquérito' : 'Guardar alterações'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
