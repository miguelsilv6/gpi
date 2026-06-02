'use client'

import { useEffect, useMemo, useState } from 'react'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { inqueritoSchema, type InqueritoFormData } from '@/lib/validations/inquerito'
import { nuipcToSlug } from '@/lib/utils'
import { EtiquetaInput } from './etiqueta-input'
import { CrimeInput } from './crime-input'
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes-warning'
import { Loader2, Plus } from 'lucide-react'

interface Brigada { id: string; nome: string }
interface Inspetor { id: string; nome: string; brigadaId: string | null }
interface Estado { id: string; codigo: string; nome: string; terminal: boolean; ativo: boolean }
interface Crime { id: string; nome: string; ativo: boolean }
interface Etiqueta { id: string; nome: string }
interface TribunalOption { id: string; nome: string; ativo: boolean; comarcaId: string | null; morada: string | null }
interface SeccaoOption { id: string; nome: string; ativo: boolean; comarcaId: string | null }
interface LocalTratamentoOption { id: string; nome: string; ativo: boolean }

const NONE_VALUE = '__none__'

interface InqueritoFormProps {
  defaultValues?: Partial<InqueritoFormData>
  brigadas: Brigada[]
  inspetores: Inspetor[]
  estados: Estado[]
  crimes: Crime[]
  /** Etiquetas pessoais do utilizador — sugestões para o seletor. */
  etiquetasDisponiveis: Etiqueta[]
  /** Etiquetas já aplicadas ao inquérito (modo edição), para render inicial. */
  etiquetasAtribuidas?: Etiqueta[]
  /** Crimes já associados ao inquérito (modo edição) — inclui inativos. */
  crimesAssociadosIniciais?: Crime[]
  tribunais: TribunalOption[]
  seccoes: SeccaoOption[]
  locaisTratamento: LocalTratamentoOption[]
  nuipcOriginal?: string
  mode: 'create' | 'edit'
  /** Whether the current user can create new sections inline from this form. */
  canCreateSeccao?: boolean
  /** Whether the current user can create new tribunals inline from this form. */
  canCreateTribunal?: boolean
}

export function InqueritoForm({
  defaultValues,
  brigadas,
  inspetores,
  estados,
  crimes,
  etiquetasDisponiveis,
  etiquetasAtribuidas = [],
  crimesAssociadosIniciais = [],
  tribunais: tribunaisProp,
  seccoes: seccoesProp,
  locaisTratamento,
  nuipcOriginal,
  mode,
  canCreateSeccao = false,
  canCreateTribunal = false,
}: InqueritoFormProps) {
  const router = useRouter()

  // Local seccoes list — starts from server-fetched prop, updated on inline creation.
  const [seccoes, setSeccoes] = useState<SeccaoOption[]>(seccoesProp)
  const [addSeccaoOpen, setAddSeccaoOpen] = useState(false)
  const [addSeccaoNome, setAddSeccaoNome] = useState('')
  const [addSeccaoSaving, setAddSeccaoSaving] = useState(false)

  // Local tribunais list — starts from server-fetched prop, updated on inline creation.
  const [tribunais, setTribunais] = useState<TribunalOption[]>(tribunaisProp)
  const [addTribunalOpen, setAddTribunalOpen] = useState(false)
  const [addTribunalNome, setAddTribunalNome] = useState('')
  const [addTribunalMorada, setAddTribunalMorada] = useState('')
  const [addTribunalComarcaId, setAddTribunalComarcaId] = useState<string | null>(null)
  const [addTribunalSaving, setAddTribunalSaving] = useState(false)
  const [comarcas, setComarcas] = useState<{ id: string; nome: string }[]>([])

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
      tribunalId: data.tribunalId === NONE_VALUE ? null : (data.tribunalId || null),
      seccaoId: data.seccaoId === NONE_VALUE ? null : (data.seccaoId || null),
      localTratamentoId: data.localTratamentoId === NONE_VALUE ? null : (data.localTratamentoId || null),
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
  const selectedEtiquetaIds = watch('etiquetaIds') ?? []
  const selectedCrimeIdsAssociados = watch('crimeIdsAssociados') ?? []
  const selectedTribunalId = watch('tribunalId')
  const selectedSeccaoId = watch('seccaoId')
  const selectedLocalTratamentoId = watch('localTratamentoId')

  // Tribunais available: active + currently assigned if inactive
  const tribunaisForSelect = useMemo(() => {
    const ativos = tribunais.filter((t) => t.ativo)
    const current = defaultValues?.tribunalId
      ? tribunais.find((t) => t.id === defaultValues.tribunalId)
      : null
    if (current && !current.ativo) return [current, ...ativos]
    return ativos
  }, [tribunais, defaultValues?.tribunalId])

  // Derive comarca and morada from the selected tribunal.
  const selectedTribunalData = useMemo(() => {
    if (!selectedTribunalId || selectedTribunalId === NONE_VALUE) return null
    return tribunais.find((t) => t.id === selectedTribunalId) ?? null
  }, [tribunais, selectedTribunalId])

  const selectedComarcaId = selectedTribunalData?.comarcaId ?? null

  const seccoesForSelect = useMemo(() => {
    // Show sections for the current comarca + global sections (comarcaId === null).
    // When no tribunal is selected, selectedComarcaId === null, so only global sections show.
    const scoped = seccoes.filter(
      (s) => s.comarcaId === selectedComarcaId || s.comarcaId === null,
    )
    const ativas = scoped.filter((s) => s.ativo)
    const current = defaultValues?.seccaoId
      ? seccoes.find((s) => s.id === defaultValues.seccaoId)
      : null
    if (current && !current.ativo && (current.comarcaId === selectedComarcaId || current.comarcaId === null)) {
      return [current, ...ativas]
    }
    return ativas
  }, [seccoes, defaultValues?.seccaoId, selectedComarcaId])

  const locaisForSelect = useMemo(() => {
    const ativos = locaisTratamento.filter((l) => l.ativo)
    const current = defaultValues?.localTratamentoId
      ? locaisTratamento.find((l) => l.id === defaultValues.localTratamentoId)
      : null
    if (current && !current.ativo) return [current, ...ativos]
    return ativos
  }, [locaisTratamento, defaultValues?.localTratamentoId])

  // Merge edit-mode initially-assigned associated crimes (may include deactivated)
  // with the active catalog so the CrimeInput can resolve names and deactivated labels.
  const crimesForAssociados = useMemo(() => {
    const known = new Map(crimes.map((c) => [c.id, c]))
    for (const c of crimesAssociadosIniciais) {
      if (!known.has(c.id)) known.set(c.id, c)
    }
    return Array.from(known.values())
  }, [crimes, crimesAssociadosIniciais])

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

  // When tribunal changes, clear seccaoId if the current secção doesn't belong to the comarca.
  useEffect(() => {
    if (!selectedSeccaoId) return
    const currentSeccao = seccoes.find((s) => s.id === selectedSeccaoId)
    if (!currentSeccao) return
    // Clear if the secção is comarca-specific and doesn't match the current comarca.
    if (currentSeccao.comarcaId !== null && currentSeccao.comarcaId !== selectedComarcaId) {
      setValue('seccaoId', null, { shouldDirty: true })
    }
  }, [selectedComarcaId, selectedSeccaoId, seccoes, setValue])

  async function openAddTribunalDialog() {
    setAddTribunalOpen(true)
    if (comarcas.length === 0) {
      try {
        const res = await fetch('/api/comarcas')
        if (res.ok) {
          setComarcas(await res.json())
        } else {
          toast.error('Erro ao carregar comarcas')
        }
      } catch {
        toast.error('Erro ao carregar comarcas')
      }
    }
  }

  async function handleAddTribunal() {
    const nome = addTribunalNome.trim()
    if (!nome) return
    setAddTribunalSaving(true)
    const res = await fetch('/api/tribunais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome,
        morada: addTribunalMorada.trim() || null,
        comarcaId: addTribunalComarcaId || null,
      }),
    })
    setAddTribunalSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao criar tribunal')
      return
    }
    const created = await res.json()
    setTribunais((prev) => [...prev, { id: created.id, nome: created.nome, ativo: true, comarcaId: created.comarcaId, morada: created.morada }])
    setValue('tribunalId', created.id, { shouldDirty: true })
    // Clear secção since different tribunal may imply different comarca
    setValue('seccaoId', null, { shouldDirty: true })
    setAddTribunalNome('')
    setAddTribunalMorada('')
    setAddTribunalComarcaId(null)
    setAddTribunalOpen(false)
    toast.success('Tribunal criado')
  }

  async function handleAddSeccao() {
    const nome = addSeccaoNome.trim()
    if (!nome) return
    setAddSeccaoSaving(true)
    const res = await fetch('/api/seccoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, comarcaId: selectedComarcaId }),
    })
    setAddSeccaoSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Erro ao criar secção')
      return
    }
    const created = await res.json()
    setSeccoes((prev) => [...prev, { id: created.id, nome: created.nome, ativo: true, comarcaId: created.comarcaId }])
    setValue('seccaoId', created.id, { shouldDirty: true })
    setAddSeccaoNome('')
    setAddSeccaoOpen(false)
    toast.success('Secção criada')
  }

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

          <div className="space-y-1.5">
            <Label>Crimes associados</Label>
            <CrimeInput
              value={selectedCrimeIdsAssociados}
              onChange={(ids) => setValue('crimeIdsAssociados', ids, { shouldDirty: true })}
              crimes={crimesForAssociados}
              excludeId={selectedCrimeId}
            />
            <p className="text-xs text-muted-foreground">
              Outros crimes presentes no mesmo inquérito. O crime principal é o único contabilizado nas estatísticas.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Etiquetas</Label>
            <EtiquetaInput
              value={selectedEtiquetaIds}
              onChange={(ids) => setValue('etiquetaIds', ids, { shouldDirty: true })}
              ownTags={etiquetasDisponiveis}
              initialTags={etiquetasAtribuidas}
            />
            <p className="text-xs text-muted-foreground">
              Escreva e prima Enter para criar uma etiqueta. Nomes repetidos são unificados.
            </p>
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
              <div className="flex items-center justify-between">
                <Label>Tribunal / M.P.</Label>
                {canCreateTribunal && (
                  <button
                    type="button"
                    onClick={openAddTribunalDialog}
                    className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Novo
                  </button>
                )}
              </div>
              <Select
                value={selectedTribunalId || NONE_VALUE}
                onValueChange={(v) => setValue('tribunalId', v === NONE_VALUE ? null : v, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar tribunal">
                    {(v: string) =>
                      !v || v === NONE_VALUE
                        ? 'Nenhum'
                        : tribunaisForSelect.find((t) => t.id === v)?.nome ?? 'Selecionar tribunal'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Nenhum</SelectItem>
                  {tribunaisForSelect.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}{!t.ativo ? ' (inativo)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTribunalData?.morada && (
                <p className="text-xs text-muted-foreground flex items-start gap-1 mt-1">
                  <span className="shrink-0">📍</span>
                  <span>{selectedTribunalData.morada}</span>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Secção</Label>
                {canCreateSeccao && (
                  <button
                    type="button"
                    onClick={() => setAddSeccaoOpen(true)}
                    className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Nova
                  </button>
                )}
              </div>
              <Select
                value={selectedSeccaoId || NONE_VALUE}
                onValueChange={(v) => setValue('seccaoId', v === NONE_VALUE ? null : v, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar secção">
                    {(v: string) =>
                      !v || v === NONE_VALUE
                        ? 'Nenhuma'
                        : seccoes.find((s) => s.id === v)?.nome ?? 'Selecionar secção'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Nenhuma</SelectItem>
                  {seccoesForSelect.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}{!s.ativo ? ' (inativa)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Local de Tratamento</Label>
              <Select
                value={selectedLocalTratamentoId || NONE_VALUE}
                onValueChange={(v) => setValue('localTratamentoId', v === NONE_VALUE ? null : v, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar local">
                    {(v: string) =>
                      !v || v === NONE_VALUE
                        ? 'Nenhum'
                        : locaisForSelect.find((l) => l.id === v)?.nome ?? 'Selecionar local'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Nenhum</SelectItem>
                  {locaisForSelect.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.nome}{!l.ativo ? ' (inativo)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* Inline tribunal creation dialog */}
      <Dialog open={addTribunalOpen} onOpenChange={(open) => { setAddTribunalOpen(open); if (!open) { setAddTribunalNome(''); setAddTribunalMorada(''); setAddTribunalComarcaId(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo Tribunal / M.P.</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="newTribunalNome">Nome *</Label>
              <Input
                id="newTribunalNome"
                autoFocus
                placeholder="Ex: Tribunal Judicial de..."
                value={addTribunalNome}
                onChange={(e) => setAddTribunalNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTribunal()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Comarca</Label>
              <Select
                value={addTribunalComarcaId ?? '__none__'}
                onValueChange={(v) => setAddTribunalComarcaId(v === '__none__' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {comarcas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newTribunalMorada">Morada</Label>
              <Input
                id="newTribunalMorada"
                placeholder="Morada do tribunal"
                value={addTribunalMorada}
                onChange={(e) => setAddTribunalMorada(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddTribunalOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleAddTribunal} disabled={addTribunalSaving || !addTribunalNome.trim()}>
              {addTribunalSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline section creation dialog */}
      <Dialog open={addSeccaoOpen} onOpenChange={(open) => { setAddSeccaoOpen(open); if (!open) setAddSeccaoNome('') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Secção</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {selectedComarcaId ? (
              <p className="text-xs text-muted-foreground">
                Será associada à comarca do tribunal selecionado.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum tribunal selecionado — a secção ficará sem associação a comarca.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="newSeccaoNome">Nome *</Label>
              <Input
                id="newSeccaoNome"
                autoFocus
                placeholder="Ex: 1ª Secção"
                value={addSeccaoNome}
                onChange={(e) => setAddSeccaoNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSeccao()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddSeccaoOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleAddSeccao} disabled={addSeccaoSaving || !addSeccaoNome.trim()}>
              {addSeccaoSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
