'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { UsersRound, Plus, Trash2, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import {
  TIPO_INTERVENIENTE,
  TIPO_PESSOA,
  TIPO_INTERVENIENTE_LABEL,
  TIPO_PESSOA_LABEL,
} from '@/lib/validations/interveniente'

export interface IntervenienteItem {
  id: string
  tipo: string
  tipoOutro: string | null
  nome: string
  tipoPessoa: string | null
  nif: string | null
  morada: string | null
  codPostal: string | null
  localidade: string | null
  contacto: string | null
  email: string | null
  responsavel: string | null
  notas: string | null
}

interface Props {
  nuipcSlug: string
  intervenientes: IntervenienteItem[]
  podeGerir: boolean
}

const TIPO_PESSOA_NONE = '__none__'

interface FormState {
  tipo: string
  tipoOutro: string
  nome: string
  tipoPessoa: string
  nif: string
  morada: string
  codPostal: string
  localidade: string
  contacto: string
  email: string
  responsavel: string
  notas: string
}

const EMPTY_FORM: FormState = {
  tipo: '',
  tipoOutro: '',
  nome: '',
  tipoPessoa: '',
  nif: '',
  morada: '',
  codPostal: '',
  localidade: '',
  contacto: '',
  email: '',
  responsavel: '',
  notas: '',
}

function itemToForm(i: IntervenienteItem): FormState {
  return {
    tipo: i.tipo,
    tipoOutro: i.tipoOutro ?? '',
    nome: i.nome,
    tipoPessoa: i.tipoPessoa ?? '',
    nif: i.nif ?? '',
    morada: i.morada ?? '',
    codPostal: i.codPostal ?? '',
    localidade: i.localidade ?? '',
    contacto: i.contacto ?? '',
    email: i.email ?? '',
    responsavel: i.responsavel ?? '',
    notas: i.notas ?? '',
  }
}

/** Etiqueta legível do papel (usa o texto livre quando é OUTRO). */
function papelLabel(i: IntervenienteItem): string {
  if (i.tipo === 'OUTRO') return i.tipoOutro?.trim() || 'Outro'
  return TIPO_INTERVENIENTE_LABEL[i.tipo as keyof typeof TIPO_INTERVENIENTE_LABEL] ?? i.tipo
}

/** Resumo de contactos/morada numa linha, para a lista. */
function detalheLinha(i: IntervenienteItem): string {
  const partes = [
    i.tipoPessoa ? TIPO_PESSOA_LABEL[i.tipoPessoa as keyof typeof TIPO_PESSOA_LABEL] : null,
    i.nif ? `NIF ${i.nif}` : null,
    i.contacto,
    i.email,
  ].filter(Boolean)
  return partes.join(' · ')
}

export function IntervenientesSection({ nuipcSlug, intervenientes, podeGerir }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  if (!podeGerir && intervenientes.length === 0) return null

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setOpen(true)
  }

  function openEdit(i: IntervenienteItem) {
    setEditId(i.id)
    setForm(itemToForm(i))
    setOpen(true)
  }

  async function handleSave() {
    if (!form.tipo) {
      toast.error('Selecione o tipo de interveniente')
      return
    }
    if (!form.nome.trim()) {
      toast.error('Indique o nome')
      return
    }
    if (form.tipo === 'OUTRO' && !form.tipoOutro.trim()) {
      toast.error('Descreva o tipo de interveniente')
      return
    }
    setSaving(true)
    try {
      const payload = {
        tipo: form.tipo,
        tipoOutro: form.tipo === 'OUTRO' ? form.tipoOutro.trim() || undefined : undefined,
        nome: form.nome.trim(),
        tipoPessoa: form.tipoPessoa || undefined,
        nif: form.nif.trim() || undefined,
        morada: form.morada.trim() || undefined,
        codPostal: form.codPostal.trim() || undefined,
        localidade: form.localidade.trim() || undefined,
        contacto: form.contacto.trim() || undefined,
        email: form.email.trim() || undefined,
        responsavel: form.responsavel.trim() || undefined,
        notas: form.notas.trim() || undefined,
      }
      const url = editId
        ? `/api/inqueritos/${nuipcSlug}/intervenientes/${editId}`
        : `/api/inqueritos/${nuipcSlug}/intervenientes`
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success(editId ? 'Interveniente atualizado' : 'Interveniente adicionado')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(i: IntervenienteItem) {
    if (!confirm(`Remover ${papelLabel(i)} "${i.nome}"?`)) return
    setRemoving(i.id)
    try {
      const res = await fetch(`/api/inqueritos/${nuipcSlug}/intervenientes/${i.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao remover')
        return
      }
      toast.success('Interveniente removido')
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <UsersRound className="h-4 w-4" />
            Outros intervenientes
          </CardTitle>
          <div className="flex items-center gap-1">
            <HelpButton title="Ajuda — Intervenientes" className="shrink-0">
              <HelpSection title="O que é">
                <p>
                  Além do denunciante, pode registar aqui outros intervenientes do inquérito
                  (lesado, vítima, testemunha, advogado/mandatário, arguido/suspeito, perito ou
                  outro). São opcionais.
                </p>
              </HelpSection>
              <HelpSection title="Quem pode gerir">
                <p>
                  Tal como o denunciante, só o <strong>titular</strong> ou a hierarquia pode
                  adicionar, editar ou remover intervenientes.
                </p>
              </HelpSection>
            </HelpButton>
            {podeGerir && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs"
                onClick={openCreate}
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {intervenientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem outros intervenientes registados.</p>
        ) : (
          <ul className="divide-y">
            {intervenientes.map((i) => {
              const detalhe = detalheLinha(i)
              return (
                <li key={i.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="shrink-0">
                        {papelLabel(i)}
                      </Badge>
                      <span className="font-medium text-sm truncate">{i.nome}</span>
                    </div>
                    {detalhe && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{detalhe}</p>
                    )}
                    {(i.morada || i.localidade) && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {[i.morada, [i.codPostal, i.localidade].filter(Boolean).join(' ')]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    )}
                    {i.notas && <p className="text-xs text-muted-foreground mt-0.5">{i.notas}</p>}
                  </div>
                  {podeGerir && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => openEdit(i)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                        title="Editar interveniente"
                        aria-label={`Editar ${i.nome}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemove(i)}
                        disabled={removing === i.id}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                        title="Remover interveniente"
                        aria-label={`Remover ${i.nome}`}
                      >
                        {removing === i.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      {/* Dialog de criação/edição */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false) }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar interveniente' : 'Novo interveniente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => v && set('tipo', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Escolher…">
                      {(v: string | null) =>
                        v
                          ? TIPO_INTERVENIENTE_LABEL[v as keyof typeof TIPO_INTERVENIENTE_LABEL]
                          : 'Escolher…'
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_INTERVENIENTE.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_INTERVENIENTE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Natureza</Label>
                <Select
                  value={form.tipoPessoa || TIPO_PESSOA_NONE}
                  onValueChange={(v) => set('tipoPessoa', v === TIPO_PESSOA_NONE ? '' : (v ?? ''))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Não especificado">
                      {(v: string | null) =>
                        v && v !== TIPO_PESSOA_NONE
                          ? TIPO_PESSOA_LABEL[v as keyof typeof TIPO_PESSOA_LABEL]
                          : 'Não especificado'
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TIPO_PESSOA_NONE}>Não especificado</SelectItem>
                    {TIPO_PESSOA.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_PESSOA_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.tipo === 'OUTRO' && (
              <div className="space-y-1.5">
                <Label htmlFor="intTipoOutro">Descrição do tipo *</Label>
                <Input
                  id="intTipoOutro"
                  placeholder="Ex.: Herdeiro, Fiel depositário…"
                  value={form.tipoOutro}
                  onChange={(e) => set('tipoOutro', e.target.value)}
                  maxLength={80}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="intNome">
                {form.tipoPessoa === 'COLETIVA' || form.tipoPessoa === 'ENTIDADE_PUBLICA'
                  ? 'Designação *'
                  : 'Nome *'}
              </Label>
              <Input
                id="intNome"
                value={form.nome}
                onChange={(e) => set('nome', e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="intNif">
                  {form.tipoPessoa === 'COLETIVA' ? 'NIPC' : 'NIF / NIPC'}
                </Label>
                <Input
                  id="intNif"
                  value={form.nif}
                  onChange={(e) => set('nif', e.target.value)}
                  maxLength={20}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="intContacto">Contacto</Label>
                <Input
                  id="intContacto"
                  value={form.contacto}
                  onChange={(e) => set('contacto', e.target.value)}
                  maxLength={60}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="intEmail">Email</Label>
              <Input
                id="intEmail"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="intMorada">Morada</Label>
              <Input
                id="intMorada"
                value={form.morada}
                onChange={(e) => set('morada', e.target.value)}
                maxLength={300}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="intCodPostal">Código postal</Label>
                <Input
                  id="intCodPostal"
                  value={form.codPostal}
                  onChange={(e) => set('codPostal', e.target.value)}
                  maxLength={20}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="intLocalidade">Localidade</Label>
                <Input
                  id="intLocalidade"
                  value={form.localidade}
                  onChange={(e) => set('localidade', e.target.value)}
                  maxLength={120}
                />
              </div>
            </div>

            {(form.tipoPessoa === 'COLETIVA' || form.tipoPessoa === 'ENTIDADE_PUBLICA') && (
              <div className="space-y-1.5">
                <Label htmlFor="intResponsavel">Responsável / representante</Label>
                <Input
                  id="intResponsavel"
                  value={form.responsavel}
                  onChange={(e) => set('responsavel', e.target.value)}
                  maxLength={200}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="intNotas">Notas</Label>
              <Textarea
                id="intNotas"
                value={form.notas}
                onChange={(e) => set('notas', e.target.value)}
                maxLength={2000}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editId ? 'Guardar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
