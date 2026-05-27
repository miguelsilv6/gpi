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
import { nuipcToSlug } from '@/lib/utils'
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes-warning'
import { Loader2 } from 'lucide-react'

interface Brigada { id: string; nome: string }
interface Inspetor { id: string; nome: string; brigadaId: string | null }
interface Estado { id: string; codigo: string; nome: string; terminal: boolean; ativo: boolean }
interface Crime { id: string; nome: string; ativo: boolean }

interface InqueritoFormProps {
  defaultValues?: Partial<InqueritoFormData>
  brigadas: Brigada[]
  inspetores: Inspetor[]
  estados: Estado[]
  crimes: Crime[]
  nuipcOriginal?: string
  mode: 'create' | 'edit'
}

export function InqueritoForm({
  defaultValues,
  brigadas,
  inspetores,
  estados,
  crimes,
  nuipcOriginal,
  mode,
}: InqueritoFormProps) {
  const router = useRouter()

  const defaultEstadoId =
    defaultValues?.estadoId ??
    estados.find((e) => e.codigo === 'ABERTO')?.id ??
    estados[0]?.id ??
    ''

  // Crimes available in the dropdown: active OR the one currently selected
  // (so editing an inquérito whose crime was later deactivated still shows it).
  const crimesForSelect = useMemo(() => {
    const ativos = crimes.filter((c) => c.ativo)
    const current = defaultValues?.crimeId
      ? crimes.find((c) => c.id === defaultValues.crimeId)
      : null
    if (current && !current.ativo) return [current, ...ativos]
    return ativos
  }, [crimes, defaultValues?.crimeId])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<InqueritoFormData>({
    resolver: zodResolver(inqueritoSchema),
    defaultValues: {
      estadoId: defaultEstadoId,
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
  const selectedCrimeId = watch('crimeId')

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
            <Label>Crime *</Label>
            <Select
              value={selectedCrimeId || ''}
              onValueChange={(v) => setValue('crimeId', v ?? '', { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar crime">
                  {(v: string) =>
                    crimesForSelect.find((c) => c.id === v)?.nome ?? 'Selecionar crime'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {crimesForSelect.length === 0 ? (
                  <SelectItem value="__empty" disabled>
                    Sem crimes configurados — adicione em Configurações
                  </SelectItem>
                ) : (
                  crimesForSelect.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}{!c.ativo ? ' (inativo)' : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {errors.crimeId && (
              <p className="text-xs text-red-600">{errors.crimeId.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado e Prazos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Estado *</Label>
              <Select
                value={watch('estadoId') || ''}
                onValueChange={(v) => setValue('estadoId', v ?? '', { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar estado">
                    {(v: string) =>
                      estados.find((e) => e.id === v)?.nome ?? 'Selecionar estado'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {estados.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.estadoId && (
                <p className="text-xs text-red-600">{errors.estadoId.message}</p>
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
          <CardTitle className="text-base">Tribunal / M.P.</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tribunal">Tribunal / M.P.</Label>
              <Input
                id="tribunal"
                placeholder="Tribunal onde corre a investigação"
                {...register('tribunal')}
              />
              {errors.tribunal && (
                <p className="text-xs text-red-600">{errors.tribunal.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="procurador">Procurador/a</Label>
              <Input
                id="procurador"
                placeholder="Procurador/a titular"
                {...register('procurador')}
              />
              {errors.procurador && (
                <p className="text-xs text-red-600">{errors.procurador.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oficialJustica">Oficial de Justiça</Label>
              <Input
                id="oficialJustica"
                placeholder="Nome do oficial de justiça"
                {...register('oficialJustica')}
              />
              {errors.oficialJustica && (
                <p className="text-xs text-red-600">{errors.oficialJustica.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="voip">VoIP / Contacto</Label>
              <Input
                id="voip"
                placeholder="Contacto directo do M.P. ou oficial"
                {...register('voip')}
              />
              {errors.voip && (
                <p className="text-xs text-red-600">{errors.voip.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notasTribunal">Notas (tribunal)</Label>
            <Textarea
              id="notasTribunal"
              placeholder="Notas sobre o tribunal, procurador/a, oficial de justiça..."
              rows={3}
              {...register('notasTribunal')}
            />
            {errors.notasTribunal && (
              <p className="text-xs text-red-600">{errors.notasTribunal.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Denunciante</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="denuncianteNome">Nome / Designação</Label>
              <Input
                id="denuncianteNome"
                placeholder="Nome completo (singular) ou designação (coletiva)"
                {...register('denuncianteNome')}
              />
              {errors.denuncianteNome && (
                <p className="text-xs text-red-600">{errors.denuncianteNome.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={watch('denuncianteTipo') || '__none__'}
                onValueChange={(v) =>
                  setValue(
                    'denuncianteTipo',
                    !v || v === '__none__' ? null : (v as 'SINGULAR' | 'COLETIVA' | 'ENTIDADE_PUBLICA' | 'OUTROS'),
                    { shouldDirty: true },
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—">
                    {(v: string) =>
                      v === 'SINGULAR'
                        ? 'Pessoa singular'
                        : v === 'COLETIVA'
                          ? 'Pessoa coletiva'
                          : v === 'ENTIDADE_PUBLICA'
                            ? 'Entidade pública'
                            : v === 'OUTROS'
                              ? 'Outros'
                              : '—'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  <SelectItem value="SINGULAR">Pessoa singular</SelectItem>
                  <SelectItem value="COLETIVA">Pessoa coletiva</SelectItem>
                  <SelectItem value="ENTIDADE_PUBLICA">Entidade pública</SelectItem>
                  <SelectItem value="OUTROS">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="denuncianteNif">NIF / NIPC</Label>
              <Input
                id="denuncianteNif"
                placeholder="123456789"
                className="font-mono"
                {...register('denuncianteNif')}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="denuncianteMorada">Morada (rua)</Label>
              <Input
                id="denuncianteMorada"
                placeholder="Rua e número"
                {...register('denuncianteMorada')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="denuncianteCodPostal">Código postal</Label>
              <Input
                id="denuncianteCodPostal"
                placeholder="0000-000"
                className="font-mono"
                {...register('denuncianteCodPostal')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="denuncianteLocalidade">Localidade</Label>
              <Input
                id="denuncianteLocalidade"
                placeholder="Lisboa"
                {...register('denuncianteLocalidade')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="denuncianteContacto">Contacto telefónico</Label>
              <Input
                id="denuncianteContacto"
                type="tel"
                placeholder="912 345 678"
                {...register('denuncianteContacto')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="denuncianteEmail">Email</Label>
              <Input
                id="denuncianteEmail"
                type="email"
                placeholder="denunciante@exemplo.pt"
                {...register('denuncianteEmail')}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="denuncianteResponsavel">Responsável (pessoa coletiva)</Label>
              <Input
                id="denuncianteResponsavel"
                placeholder="Nome do interlocutor"
                {...register('denuncianteResponsavel')}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="denuncianteNotas">Notas sobre o denunciante</Label>
            <Textarea
              id="denuncianteNotas"
              placeholder="Observações..."
              rows={3}
              {...register('denuncianteNotas')}
            />
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
