'use client'

import { useParams, useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, Loader2, Settings, Bell, Info } from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { slugToNuipc, nuipcToSlug, cn } from '@/lib/utils'

interface AtividadePadrao {
  id: string
  nome: string
  descricao: string | null
  ativa: boolean
  temPrazo: boolean
  temQuantidade: boolean
  transicaoEstadoId: string | null
}

interface EstadoOption {
  id: string
  codigo: string
  nome: string
  cor: string | null
  terminal: boolean
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
  descricao: z.string().min(1, 'Selecione uma atividade'),
  observacoes: z.string().max(2000).optional(),
  dataRealizacao: z.string().optional(),
  quantidade: z.number().int().min(1).optional(),
  dataPrazo: z.string().optional(),
  alertaDias1: z.number().int().optional(),
  alertaDias2: z.number().int().optional(),
})

type FormData = z.infer<typeof schema>

export default function AddAtividadePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.nuipc as string
  const nuipc = slugToNuipc(slug)
  const [inqueritoid, setInqueritoid] = useState<string | null>(null)
  const [atividadesPadrao, setAtividadesPadrao] = useState<AtividadePadrao[]>([])
  const [estados, setEstados] = useState<EstadoOption[]>([])
  const [loadingPadrao, setLoadingPadrao] = useState(true)
  const [showAlerta2, setShowAlerta2] = useState(false)

  useEffect(() => {
    fetch(`/api/inqueritos/${slug}`)
      .then((r) => r.json())
      .then((d) => setInqueritoid(d.id))
      .catch(() => toast.error('Erro ao carregar inquérito'))

    Promise.all([
      fetch('/api/atividades-padrao').then((r) => r.json()),
      fetch('/api/estados-inquerito').then((r) => r.json()),
    ])
      .then(([padroes, est]) => {
        setAtividadesPadrao(
          Array.isArray(padroes) ? padroes.filter((a: AtividadePadrao) => a.ativa) : [],
        )
        setEstados(Array.isArray(est) ? est : [])
      })
      .catch(() => {})
      .finally(() => setLoadingPadrao(false))
  }, [slug])

  const defaultDatetime = new Date().toISOString().slice(0, 16)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { dataRealizacao: defaultDatetime },
  })

  const selectedNome = watch('descricao')
  const watchedAlerta1 = watch('alertaDias1')
  const selectedPadrao = atividadesPadrao.find((a) => a.nome === selectedNome)
  const transicaoTarget = selectedPadrao?.transicaoEstadoId
    ? estados.find((e) => e.id === selectedPadrao.transicaoEstadoId) ?? null
    : null

  async function onSubmit(data: FormData) {
    if (!inqueritoid) return

    const payload = {
      ...data,
      inqueritoid,
      quantidade: selectedPadrao?.temQuantidade ? (data.quantidade ?? null) : null,
      dataPrazo: selectedPadrao?.temPrazo ? (data.dataPrazo || null) : null,
      alertaDias1: selectedPadrao?.temPrazo ? (data.alertaDias1 ?? null) : null,
      alertaDias2: (selectedPadrao?.temPrazo && showAlerta2) ? (data.alertaDias2 ?? null) : null,
    }

    const res = await fetch('/api/atividades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? 'Erro ao guardar atividade')
      return
    }

    const body = await res.json().catch(() => null)
    const transicao = body?.transicao

    if (transicao?.applied) {
      toast.success(
        `Atividade registada — estado alterado para «${transicao.novoEstado.nome}».`,
      )
    } else if (transicao?.skipped) {
      const reasonMsg =
        transicao.reason === 'estado_alvo_invalido'
          ? 'estado-alvo está inactivo'
          : transicao.reason === 'transicao_invalida'
            ? 'transição não permitida'
            : 'desconhecida'
      toast.warning(
        `Atividade registada, mas o estado não foi alterado (${reasonMsg}).`,
      )
    } else {
      toast.success('Atividade registada')
    }

    router.push(`/inqueritos/${nuipcToSlug(nuipc)}`)
    router.refresh()
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center gap-2">
        <Link
          href={`/inqueritos/${nuipcToSlug(nuipc)}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {nuipc}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nova Atividade</h1>
        <p className="text-muted-foreground text-sm font-mono">{nuipc}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registo de atividade</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {/* Datetime */}
            <div className="space-y-1.5">
              <Label htmlFor="dataRealizacao">Data de realização</Label>
              <Input id="dataRealizacao" type="datetime-local" {...register('dataRealizacao')} />
            </div>

            {/* Activity type dropdown */}
            <div className="space-y-1.5">
              <Label>
                Tipo de atividade <span className="text-red-500">*</span>
              </Label>

              {loadingPadrao ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground h-9">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A carregar...
                </div>
              ) : atividadesPadrao.length === 0 ? (
                <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground flex items-start gap-2">
                  <Settings className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Nenhuma atividade padrão configurada.{' '}
                    <Link href="/configuracoes" className="text-foreground underline underline-offset-2 hover:no-underline">
                      Configurar em Configurações → Atividades
                    </Link>
                  </span>
                </div>
              ) : (
                <Controller
                  name="descricao"
                  control={control}
                  render={({ field }) => (
                    <Select
                      onValueChange={(v) => {
                        field.onChange(v)
                        // Reset conditional fields when type changes
                        setValue('quantidade', undefined)
                        setValue('dataPrazo', undefined)
                        setValue('alertaDias1', undefined)
                        setValue('alertaDias2', undefined)
                        setShowAlerta2(false)
                      }}
                      value={field.value ?? ''}
                    >
                      <SelectTrigger className={errors.descricao ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Selecionar tipo de atividade..." />
                      </SelectTrigger>
                      <SelectContent>
                        {atividadesPadrao.map((a) => (
                          <SelectItem key={a.id} value={a.nome}>
                            <span>{a.nome}</span>
                            {(a.temPrazo || a.temQuantidade) && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {[a.temPrazo && 'Prazo', a.temQuantidade && 'Qtd'].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}

              {errors.descricao && (
                <p className="text-xs text-red-600">{errors.descricao.message}</p>
              )}
              {selectedPadrao?.descricao && (
                <p className="text-xs text-muted-foreground italic">{selectedPadrao.descricao}</p>
              )}
              {transicaoTarget && (
                <div
                  className={cn(
                    'mt-2 rounded-lg border px-3 py-2 text-xs flex items-start gap-2',
                    transicaoTarget.terminal
                      ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300'
                      : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300',
                  )}
                >
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Ao guardar, o estado do inquérito passa para{' '}
                    <strong>«{transicaoTarget.nome}»</strong>
                    {transicaoTarget.terminal && ' (estado terminal — exigirá reabertura para voltar a editar).'}
                  </span>
                </div>
              )}
            </div>

            {/* Quantidade (conditional) */}
            {selectedPadrao?.temQuantidade && (
              <div className="space-y-1.5">
                <Label htmlFor="quantidade">Quantidade</Label>
                <Input
                  id="quantidade"
                  type="number"
                  min={1}
                  placeholder="Ex: 7"
                  {...register('quantidade', { valueAsNumber: true })}
                />
                {errors.quantidade && (
                  <p className="text-xs text-red-600">{errors.quantidade.message}</p>
                )}
              </div>
            )}

            {/* Prazo + Alertas (conditional) */}
            {selectedPadrao?.temPrazo && (
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
                  <Controller
                    name="alertaDias1"
                    control={control}
                    render={({ field }) => (
                      <Select
                        onValueChange={(v) => field.onChange(Number(v))}
                        value={field.value != null ? String(field.value) : ''}
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
                    )}
                  />
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
                        onClick={() => { setShowAlerta2(false); setValue('alertaDias2', undefined) }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Remover
                      </button>
                    </div>
                    <Controller
                      name="alertaDias2"
                      control={control}
                      render={({ field }) => (
                        <Select
                          onValueChange={(v) => field.onChange(Number(v))}
                          value={field.value != null ? String(field.value) : ''}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sem 2.º aviso" />
                          </SelectTrigger>
                          <SelectContent>
                            {ALERT_OPTIONS.filter((o) => o.value !== watchedAlerta1).map((opt) => (
                              <SelectItem key={opt.value} value={String(opt.value)}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Observations */}
            <div className="space-y-1.5">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                placeholder="Notas adicionais sobre esta atividade (opcional)..."
                rows={4}
                {...register('observacoes')}
              />
              {errors.observacoes && (
                <p className="text-xs text-red-600">{errors.observacoes.message}</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={isSubmitting || !inqueritoid || atividadesPadrao.length === 0}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registar
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
