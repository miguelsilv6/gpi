'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PrazoUrgencyBadge } from '@/components/prazos/prazo-urgency-badge'
import { ProdutosPanel } from './produtos-panel'
import {
  TIPO_LINHA_LABEL,
  TIPO_LINHA_VALUES,
  INTERCECAO_ALERTA1_DEFAULT,
  INTERCECAO_ALERTA2_DEFAULT,
  estadoLinha,
} from '@/lib/validations/intercecao'
import { formatDate, cn, iconButtonClasses } from '@/lib/utils'
import { Loader2, Plus, Pencil, Trash2, RadioTower, Target, CalendarPlus, StickyNote } from 'lucide-react'
import type { TipoLinhaIntercecao } from '@/generated/prisma/enums'

export interface LinhaDTO {
  id: string
  tipo: TipoLinhaIntercecao
  identificador: string
  rede: string | null
  dataInicio: string
  dataFim: string
  alertaDias1: number | null
  alertaDias2: number | null
  renovacoes: number
  observacoes: string | null
}

export interface AlvoDTO {
  id: string
  nome: string
  codigo: string
  observacoes: string | null
  notas: string | null
  linhas: LinhaDTO[]
  produtos: number
}

interface Props {
  nuipcSlug: string
  alvos: AlvoDTO[]
  canEdit: boolean
}

// ── Formulários (estado controlado simples, padrão das tabs de configuração) ─

interface AlvoForm {
  nome: string
  codigo: string
  observacoes: string
  notas: string
}
const EMPTY_ALVO: AlvoForm = { nome: '', codigo: '', observacoes: '', notas: '' }

interface LinhaForm {
  tipo: TipoLinhaIntercecao
  identificador: string
  rede: string
  dataInicio: string
  dataFim: string
  alertaDias1: string
  alertaDias2: string
  observacoes: string
}
const EMPTY_LINHA: LinhaForm = {
  tipo: 'SIM',
  identificador: '',
  rede: '',
  dataInicio: '',
  dataFim: '',
  alertaDias1: String(INTERCECAO_ALERTA1_DEFAULT),
  alertaDias2: String(INTERCECAO_ALERTA2_DEFAULT),
  observacoes: '',
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10)
}

export function IntercecoesView({ nuipcSlug, alvos, canEdit }: Props) {
  const router = useRouter()
  const base = `/api/inqueritos/${nuipcSlug}/intercecoes`

  // Dialog de alvo (criar/editar)
  const [alvoDialog, setAlvoDialog] = useState<{ mode: 'create' } | { mode: 'edit'; id: string } | null>(null)
  const [alvoForm, setAlvoForm] = useState<AlvoForm>(EMPTY_ALVO)
  // Dialog de linha (criar/editar)
  const [linhaDialog, setLinhaDialog] = useState<
    { mode: 'create'; alvoId: string } | { mode: 'edit'; alvoId: string; id: string } | null
  >(null)
  const [linhaForm, setLinhaForm] = useState<LinhaForm>(EMPTY_LINHA)
  // Dialog de renovação (prorrogação da data de fim)
  const [renovarDialog, setRenovarDialog] = useState<LinhaDTO | null>(null)
  const [novaDataFim, setNovaDataFim] = useState('')
  const [saving, setSaving] = useState(false)

  function openCreateAlvo() {
    setAlvoForm(EMPTY_ALVO)
    setAlvoDialog({ mode: 'create' })
  }
  function openEditAlvo(a: AlvoDTO) {
    setAlvoForm({ nome: a.nome, codigo: a.codigo, observacoes: a.observacoes ?? '', notas: a.notas ?? '' })
    setAlvoDialog({ mode: 'edit', id: a.id })
  }
  function openCreateLinha(alvoId: string) {
    setLinhaForm(EMPTY_LINHA)
    setLinhaDialog({ mode: 'create', alvoId })
  }
  function openEditLinha(alvoId: string, l: LinhaDTO) {
    setLinhaForm({
      tipo: l.tipo,
      identificador: l.identificador,
      rede: l.rede ?? '',
      dataInicio: toDateInput(l.dataInicio),
      dataFim: toDateInput(l.dataFim),
      alertaDias1: l.alertaDias1 == null ? '' : String(l.alertaDias1),
      alertaDias2: l.alertaDias2 == null ? '' : String(l.alertaDias2),
      observacoes: l.observacoes ?? '',
    })
    setLinhaDialog({ mode: 'edit', alvoId, id: l.id })
  }

  async function submit(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<boolean> {
    setSaving(true)
    try {
      const res = await fetch(url, {
        method,
        ...(body !== undefined && {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return false
      }
      return true
    } catch {
      toast.error('Erro de rede')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleAlvoSubmit() {
    if (!alvoDialog) return
    const payload = {
      nome: alvoForm.nome,
      codigo: alvoForm.codigo,
      observacoes: alvoForm.observacoes,
      notas: alvoForm.notas,
    }
    const ok =
      alvoDialog.mode === 'create'
        ? await submit(base, 'POST', payload)
        : await submit(`${base}/alvos/${alvoDialog.id}`, 'PUT', payload)
    if (ok) {
      toast.success(alvoDialog.mode === 'create' ? 'Alvo criado' : 'Alvo atualizado')
      setAlvoDialog(null)
      router.refresh()
    }
  }

  async function handleDeleteAlvo(a: AlvoDTO) {
    if (!confirm(`Eliminar o alvo «${a.nome}» (código ${a.codigo})? As linhas e os produtos associados são também eliminados.`)) return
    if (await submit(`${base}/alvos/${a.id}`, 'DELETE')) {
      toast.success('Alvo eliminado')
      router.refresh()
    }
  }

  // '' → aviso desligado (null); número → dias.
  function parseAlerta(s: string): number | null {
    if (s.trim() === '') return null
    const n = parseInt(s, 10)
    return Number.isFinite(n) ? n : null
  }

  async function handleLinhaSubmit() {
    if (!linhaDialog) return
    const payload = {
      tipo: linhaForm.tipo,
      identificador: linhaForm.identificador,
      rede: linhaForm.rede,
      dataInicio: linhaForm.dataInicio,
      dataFim: linhaForm.dataFim,
      alertaDias1: parseAlerta(linhaForm.alertaDias1),
      alertaDias2: parseAlerta(linhaForm.alertaDias2),
      observacoes: linhaForm.observacoes,
    }
    const ok =
      linhaDialog.mode === 'create'
        ? await submit(`${base}/alvos/${linhaDialog.alvoId}/linhas`, 'POST', payload)
        : await submit(`${base}/linhas/${linhaDialog.id}`, 'PUT', payload)
    if (ok) {
      toast.success(linhaDialog.mode === 'create' ? 'Linha adicionada' : 'Linha atualizada')
      setLinhaDialog(null)
      router.refresh()
    }
  }

  async function handleDeleteLinha(l: LinhaDTO) {
    if (!confirm(`Eliminar a linha ${TIPO_LINHA_LABEL[l.tipo]} ${l.identificador}? Os produtos registados mantêm-se (sem linha associada).`)) return
    if (await submit(`${base}/linhas/${l.id}`, 'DELETE')) {
      toast.success('Linha eliminada')
      router.refresh()
    }
  }

  function openRenovar(l: LinhaDTO) {
    // Pré-preenche com o dia seguinte ao fim atual (a nova data tem de ser posterior).
    const d = new Date(l.dataFim)
    d.setDate(d.getDate() + 1)
    setNovaDataFim(d.toISOString().slice(0, 10))
    setRenovarDialog(l)
  }

  async function handleRenovar() {
    if (!renovarDialog) return
    const ok = await submit(`${base}/linhas/${renovarDialog.id}/renovar`, 'POST', { novaDataFim })
    if (ok) {
      toast.success('Interceção renovada')
      setRenovarDialog(null)
      router.refresh()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {alvos.length === 0
            ? 'Sem alvos registados.'
            : `${alvos.length} alvo${alvos.length !== 1 ? 's' : ''} sob interceção.`}
        </p>
        {canEdit && (
          <Button size="sm" onClick={openCreateAlvo} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Novo alvo
          </Button>
        )}
      </div>

      {alvos.map((alvo) => (
        <Card key={alvo.id}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Target className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-semibold truncate">{alvo.nome}</span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted shrink-0">
                  código {alvo.codigo}
                </span>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => openCreateLinha(alvo.id)}>
                    <Plus className="h-3 w-3" /> Linha
                  </Button>
                  <button
                    onClick={() => openEditAlvo(alvo)}
                    className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                    title="Editar alvo"
                    aria-label={`Editar alvo ${alvo.nome}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteAlvo(alvo)}
                    className={cn(iconButtonClasses, 'text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30')}
                    title="Eliminar alvo"
                    aria-label={`Eliminar alvo ${alvo.nome}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            {alvo.observacoes && (
              <p className="text-xs text-muted-foreground mt-1">{alvo.observacoes}</p>
            )}
            {alvo.notas && (
              <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 px-2 py-1.5">
                <StickyNote className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{alvo.notas}</p>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {alvo.linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem linhas intercetadas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Tipo</th>
                      <th className="py-1.5 pr-3 font-medium">N.º telefone / IMEI</th>
                      <th className="py-1.5 pr-3 font-medium">Rede</th>
                      <th className="py-1.5 pr-3 font-medium">Início</th>
                      <th className="py-1.5 pr-3 font-medium">Fim</th>
                      <th className="py-1.5 pr-3 font-medium">Prazo</th>
                      <th className="py-1.5 pr-3 font-medium">Avisos</th>
                      {canEdit && <th className="py-1.5 font-medium sr-only">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {alvo.linhas.map((l) => {
                      const terminada = estadoLinha(new Date(l.dataFim)) === 'terminada'
                      return (
                        <tr key={l.id} className={cn(terminada && 'opacity-60')}>
                          <td className="py-2 pr-3 whitespace-nowrap">{TIPO_LINHA_LABEL[l.tipo]}</td>
                          <td className="py-2 pr-3 font-mono whitespace-nowrap">{l.identificador}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{l.rede ?? '—'}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{formatDate(l.dataInicio)}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {formatDate(l.dataFim)}
                            {l.renovacoes > 0 && (
                              <span
                                className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                                title={`Renovada ${l.renovacoes} ${l.renovacoes === 1 ? 'vez' : 'vezes'}`}
                              >
                                {l.renovacoes}× renov.
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {terminada ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                                Terminada
                              </span>
                            ) : (
                              <PrazoUrgencyBadge
                                dataPrazo={l.dataFim}
                                alertaDias={l.alertaDias1 ?? INTERCECAO_ALERTA1_DEFAULT}
                              />
                            )}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                            {l.alertaDias1 == null && l.alertaDias2 == null
                              ? '—'
                              : [l.alertaDias1, l.alertaDias2].filter((v) => v != null).join(' / ') + ' d'}
                          </td>
                          {canEdit && (
                            <td className="py-2 whitespace-nowrap">
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={() => openRenovar(l)}
                                  className={cn(iconButtonClasses, 'text-muted-foreground hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-900/30')}
                                  title="Renovar (prorrogar data de fim)"
                                  aria-label={`Renovar linha ${l.identificador}`}
                                >
                                  <CalendarPlus className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => openEditLinha(alvo.id, l)}
                                  className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                                  title="Editar linha"
                                  aria-label={`Editar linha ${l.identificador}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteLinha(l)}
                                  className={cn(iconButtonClasses, 'text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30')}
                                  title="Eliminar linha"
                                  aria-label={`Eliminar linha ${l.identificador}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <ProdutosPanel
              nuipcSlug={nuipcSlug}
              alvoId={alvo.id}
              totalInicial={alvo.produtos}
              linhas={alvo.linhas.map((l) => ({ id: l.id, tipo: l.tipo, identificador: l.identificador }))}
              canEdit={canEdit}
            />
          </CardContent>
        </Card>
      ))}

      {alvos.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <RadioTower className="h-8 w-8 mx-auto mb-3 opacity-40" />
            Registe o primeiro alvo para começar o controlo de interceções.
          </CardContent>
        </Card>
      )}

      {/* Dialog alvo */}
      <Dialog open={alvoDialog !== null} onOpenChange={(o) => !o && setAlvoDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{alvoDialog?.mode === 'edit' ? 'Editar alvo' : 'Novo alvo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="alvoNome">Suspeito *</Label>
              <Input
                id="alvoNome"
                autoFocus
                placeholder="Nome do suspeito"
                value={alvoForm.nome}
                onChange={(e) => setAlvoForm({ ...alvoForm, nome: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alvoCodigo">Código do alvo *</Label>
              <Input
                id="alvoCodigo"
                placeholder="ex.: 123"
                className="font-mono"
                value={alvoForm.codigo}
                onChange={(e) => setAlvoForm({ ...alvoForm, codigo: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alvoObs">Observações</Label>
              <Textarea
                id="alvoObs"
                rows={2}
                value={alvoForm.observacoes}
                onChange={(e) => setAlvoForm({ ...alvoForm, observacoes: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alvoNotas" className="flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                Notas do inspetor
              </Label>
              <Textarea
                id="alvoNotas"
                rows={3}
                placeholder="Informação relevante sobre o alvo (livre)."
                value={alvoForm.notas}
                onChange={(e) => setAlvoForm({ ...alvoForm, notas: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAlvoDialog(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleAlvoSubmit} disabled={saving || !alvoForm.nome.trim() || !alvoForm.codigo.trim()}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog linha */}
      <Dialog open={linhaDialog !== null} onOpenChange={(o) => !o && setLinhaDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{linhaDialog?.mode === 'edit' ? 'Editar linha' : 'Nova linha intercetada'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select
                value={linhaForm.tipo}
                onValueChange={(v) => v && setLinhaForm({ ...linhaForm, tipo: v as TipoLinhaIntercecao })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) =>
                      v ? TIPO_LINHA_LABEL[v as TipoLinhaIntercecao] ?? v : 'Escolher…'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIPO_LINHA_VALUES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LINHA_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linhaIdent">N.º telefone / IMEI *</Label>
              <Input
                id="linhaIdent"
                className="font-mono"
                placeholder="912345678 / 35xxxxxxxxxxxxx"
                value={linhaForm.identificador}
                onChange={(e) => setLinhaForm({ ...linhaForm, identificador: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linhaRede">Rede</Label>
              <Input
                id="linhaRede"
                placeholder="MEO, Vodafone, NOS…"
                list="redes-sugeridas"
                value={linhaForm.rede}
                onChange={(e) => setLinhaForm({ ...linhaForm, rede: e.target.value })}
              />
              <datalist id="redes-sugeridas">
                <option value="MEO" />
                <option value="Vodafone" />
                <option value="NOS" />
                <option value="Digi" />
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linhaInicio">Data de início *</Label>
              <Input
                id="linhaInicio"
                type="date"
                value={linhaForm.dataInicio}
                onChange={(e) => setLinhaForm({ ...linhaForm, dataInicio: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linhaFim">Data de fim *</Label>
              <Input
                id="linhaFim"
                type="date"
                value={linhaForm.dataFim}
                onChange={(e) => setLinhaForm({ ...linhaForm, dataFim: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linhaAlerta1">1.º aviso (dias antes)</Label>
              <Input
                id="linhaAlerta1"
                type="number"
                min={0}
                max={365}
                placeholder="sem aviso"
                value={linhaForm.alertaDias1}
                onChange={(e) => setLinhaForm({ ...linhaForm, alertaDias1: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linhaAlerta2">2.º aviso (dias antes)</Label>
              <Input
                id="linhaAlerta2"
                type="number"
                min={0}
                max={365}
                placeholder="sem aviso"
                value={linhaForm.alertaDias2}
                onChange={(e) => setLinhaForm({ ...linhaForm, alertaDias2: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="linhaObs">Observações</Label>
              <Textarea
                id="linhaObs"
                rows={2}
                value={linhaForm.observacoes}
                onChange={(e) => setLinhaForm({ ...linhaForm, observacoes: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Deixar um aviso em branco desliga-o. Alterar a data de fim (ex.: renovação)
            reativa os avisos automaticamente.
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setLinhaDialog(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleLinhaSubmit}
              disabled={saving || !linhaForm.identificador.trim() || !linhaForm.dataInicio || !linhaForm.dataFim}
            >
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog renovar (prorrogação) */}
      <Dialog open={renovarDialog !== null} onOpenChange={(o) => !o && setRenovarDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renovar interceção</DialogTitle>
          </DialogHeader>
          {renovarDialog && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                {TIPO_LINHA_LABEL[renovarDialog.tipo]}{' '}
                <span className="font-mono">{renovarDialog.identificador}</span> — fim atual{' '}
                <span className="font-medium text-foreground">{formatDate(renovarDialog.dataFim)}</span>
                {renovarDialog.renovacoes > 0 && ` · ${renovarDialog.renovacoes} renovação(ões)`}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="renovarData">Nova data de fim *</Label>
                <Input
                  id="renovarData"
                  type="date"
                  value={novaDataFim}
                  min={toDateInput(renovarDialog.dataFim)}
                  onChange={(e) => setNovaDataFim(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A nova data tem de ser posterior à atual. Os avisos de fim são reativados
                automaticamente para o novo prazo.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setRenovarDialog(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleRenovar}
              disabled={
                saving ||
                !novaDataFim ||
                (renovarDialog != null && novaDataFim <= toDateInput(renovarDialog.dataFim))
              }
            >
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Renovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
