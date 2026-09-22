'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatDate, cn, iconButtonClasses } from '@/lib/utils'
import { Contact, ImagePlus, Loader2, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react'

export interface RelacaoDTO {
  id: string
  contacto: string
  nome: string | null
  morada: string | null
  documento: string | null
  dataNascimento: string | null
  fichaSpo: string | null
  notas: string | null
  temFoto: boolean
}

interface Pendente {
  contacto: string
  ocorrencias: number
}

interface Props {
  nuipcSlug: string
  relacoes: RelacaoDTO[]
  canEdit: boolean
}

interface RelacaoForm {
  contacto: string
  nome: string
  morada: string
  documento: string
  dataNascimento: string
  fichaSpo: string
  notas: string
}

const EMPTY: RelacaoForm = {
  contacto: '',
  nome: '',
  morada: '',
  documento: '',
  dataNascimento: '',
  fichaSpo: '',
  notas: '',
}

/**
 * Relações — os contactos que aparecem nas escutas, com a identificação já
 * apurada (folha "Relações" do controlo em papel). Identificar aqui resolve de
 * uma vez o "DE"/"PARA" de todos os produtos onde o número aparece.
 *
 * A lista de "por identificar" é calculada a pedido (não vem no carregamento
 * da página): é uma varredura dos produtos e só interessa quando se está a
 * trabalhar nas relações.
 */
export function RelacoesPanel({ nuipcSlug, relacoes, canEdit }: Props) {
  const router = useRouter()
  const base = `/api/inqueritos/${nuipcSlug}/intercecoes/relacoes`

  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; id: string } | null>(null)
  const [form, setForm] = useState<RelacaoForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [pendentes, setPendentes] = useState<Pendente[] | null>(null)
  const [loadingPendentes, setLoadingPendentes] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [aCarregarFoto, setACarregarFoto] = useState<string | null>(null)

  const carregarPendentes = useCallback(async () => {
    setLoadingPendentes(true)
    try {
      const res = await fetch(`${base}?pendentes=1`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPendentes(data.pendentes ?? [])
    } catch {
      toast.error('Erro ao procurar contactos por identificar')
    } finally {
      setLoadingPendentes(false)
    }
  }, [base])

  // Recarrega depois de qualquer alteração às relações (um contacto fichado
  // deixa de estar pendente).
  useEffect(() => {
    if (pendentes !== null) void carregarPendentes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relacoes.length])

  function openCreate(contacto = '') {
    setForm({ ...EMPTY, contacto })
    setDialog({ mode: 'create' })
  }

  function openEdit(r: RelacaoDTO) {
    setForm({
      contacto: r.contacto,
      nome: r.nome ?? '',
      morada: r.morada ?? '',
      documento: r.documento ?? '',
      dataNascimento: r.dataNascimento?.slice(0, 10) ?? '',
      fichaSpo: r.fichaSpo ?? '',
      notas: r.notas ?? '',
    })
    setDialog({ mode: 'edit', id: r.id })
  }

  async function submit() {
    if (!dialog) return
    setSaving(true)
    try {
      const res = await fetch(dialog.mode === 'create' ? base : `${base}/${dialog.id}`, {
        method: dialog.mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success(dialog.mode === 'create' ? 'Contacto fichado' : 'Ficha atualizada')
      setDialog(null)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setSaving(false)
    }
  }

  async function eliminar(r: RelacaoDTO) {
    const quem = r.nome ? `«${r.nome}» (${r.contacto})` : r.contacto
    if (!confirm(`Eliminar a ficha de ${quem}? Os produtos mantêm-se, mas deixam de mostrar o nome.`)) return
    try {
      const res = await fetch(`${base}/${r.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao eliminar')
        return
      }
      toast.success('Ficha eliminada')
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    }
  }

  async function carregarFoto(relacaoId: string, file: File) {
    setACarregarFoto(relacaoId)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(`${base}/${relacaoId}/foto`, { method: 'POST', body })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao carregar a foto')
        return
      }
      toast.success('Foto carregada')
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setACarregarFoto(null)
    }
  }

  async function removerFoto(relacaoId: string) {
    try {
      const res = await fetch(`${base}/${relacaoId}/foto`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao remover a foto')
        return
      }
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Contact className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-semibold">Relações</span>
            <span className="text-xs text-muted-foreground">
              {relacoes.length === 0
                ? 'sem contactos fichados'
                : `${relacoes.length} contacto${relacoes.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-1 h-7 text-xs"
              onClick={carregarPendentes}
              disabled={loadingPendentes}
            >
              {loadingPendentes ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <UserPlus className="h-3 w-3" />
              )}
              Por identificar
            </Button>
            {canEdit && (
              <Button size="sm" className="gap-1 h-7 text-xs" onClick={() => openCreate()}>
                <Plus className="h-3 w-3" /> Contacto
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Identificar um número aqui preenche automaticamente o &quot;DE&quot; e o &quot;PARA&quot;
          de todos os produtos onde ele aparece.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {pendentes !== null && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Contactos nos produtos ainda sem ficha
              </Label>
              <button
                onClick={() => setPendentes(null)}
                className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                aria-label="Fechar lista de contactos por identificar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {pendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todos os números que aparecem nos produtos já estão fichados.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {pendentes.map((p) => (
                  <button
                    key={p.contacto}
                    disabled={!canEdit}
                    onClick={() => openCreate(p.contacto)}
                    title={
                      canEdit
                        ? `Fichar ${p.contacto} (${p.ocorrencias} produto${p.ocorrencias !== 1 ? 's' : ''})`
                        : `${p.ocorrencias} produto${p.ocorrencias !== 1 ? 's' : ''}`
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 text-xs font-mono text-amber-900 dark:text-amber-200 enabled:hover:bg-amber-100 dark:enabled:hover:bg-amber-950/50 disabled:cursor-default"
                  >
                    {p.contacto}
                    <span className="font-sans opacity-70">×{p.ocorrencias}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {relacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem contactos fichados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Contacto</th>
                  <th className="py-1.5 pr-3 font-medium">Nome</th>
                  <th className="py-1.5 pr-3 font-medium">Morada</th>
                  <th className="py-1.5 pr-3 font-medium">Doc. identificação</th>
                  <th className="py-1.5 pr-3 font-medium">Nascimento</th>
                  <th className="py-1.5 pr-3 font-medium">Ficha SPO</th>
                  <th className="py-1.5 pr-3 font-medium">Foto</th>
                  {canEdit && <th className="py-1.5 font-medium sr-only">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {relacoes.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 font-mono whitespace-nowrap">{r.contacto}</td>
                    <td className="py-2 pr-3">{r.nome ?? <span className="text-muted-foreground">?</span>}</td>
                    <td className="py-2 pr-3">{r.morada ?? '—'}</td>
                    <td className="py-2 pr-3">{r.documento ?? '—'}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.dataNascimento ? formatDate(r.dataNascimento) : '—'}
                    </td>
                    <td className="py-2 pr-3">{r.fichaSpo ?? '—'}</td>
                    <td className="py-2 pr-3">
                      {r.temFoto ? (
                        <span className="inline-flex items-center gap-1.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`${base}/${r.id}/foto`}
                            alt={`Foto de ${r.nome ?? r.contacto}`}
                            className="h-8 w-8 rounded object-cover border"
                          />
                          {canEdit && (
                            <button
                              onClick={() => removerFoto(r.id)}
                              className={cn(iconButtonClasses, 'text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30')}
                              title="Remover foto"
                              aria-label={`Remover foto de ${r.nome ?? r.contacto}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      ) : canEdit ? (
                        <button
                          onClick={() => {
                            if (!fileInput.current) return
                            fileInput.current.dataset.relacaoId = r.id
                            fileInput.current.click()
                          }}
                          disabled={aCarregarFoto === r.id}
                          className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                          title="Carregar foto"
                          aria-label={`Carregar foto de ${r.nome ?? r.contacto}`}
                        >
                          {aCarregarFoto === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ImagePlus className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    {canEdit && (
                      <td className="py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openEdit(r)}
                            className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                            title="Editar ficha"
                            aria-label={`Editar ficha de ${r.nome ?? r.contacto}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => eliminar(r)}
                            className={cn(iconButtonClasses, 'text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30')}
                            title="Eliminar ficha"
                            aria-label={`Eliminar ficha de ${r.nome ?? r.contacto}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Input único partilhado: o alvo do upload vai no dataset. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          const relacaoId = e.target.dataset.relacaoId
          e.target.value = ''
          if (file && relacaoId) void carregarFoto(relacaoId, file)
        }}
      />

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'edit' ? 'Editar ficha' : 'Fichar contacto'}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto -mx-4 px-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="relContacto">Contacto *</Label>
                <Input
                  id="relContacto"
                  autoFocus
                  className="font-mono"
                  placeholder="912345678"
                  value={form.contacto}
                  onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="relNome">Nome</Label>
                <Input
                  id="relNome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="relMorada">Morada</Label>
                <Input
                  id="relMorada"
                  value={form.morada}
                  onChange={(e) => setForm({ ...form, morada: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="relDoc">Doc. de identificação</Label>
                <Input
                  id="relDoc"
                  value={form.documento}
                  onChange={(e) => setForm({ ...form, documento: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="relNasc">Data de nascimento</Label>
                <Input
                  id="relNasc"
                  type="date"
                  value={form.dataNascimento}
                  onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="relSpo">Ficha no SPO</Label>
                <Input
                  id="relSpo"
                  value={form.fichaSpo}
                  onChange={(e) => setForm({ ...form, fichaSpo: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="relNotas">Notas</Label>
                <Textarea
                  id="relNotas"
                  rows={2}
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              O número é guardado só com dígitos, para que &quot;928 022 089&quot; e
              &quot;928022089&quot; sejam o mesmo contacto. A foto carrega-se na tabela, depois de
              guardar.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={submit} disabled={saving || !form.contacto.trim()}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
