'use client'

import { Fragment, useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  TIPO_PRODUTO_LABEL,
  TIPO_PRODUTO_VALUES,
  TIPO_PRODUTO_BADGE,
  DIRECAO_LABEL,
  DIRECAO_VALUES,
  TIPO_LINHA_LABEL,
  TRANSCRICAO_LABEL,
  TRANSCRICAO_BADGE,
  TRANSCRICAO_VALUES,
  temTranscricao,
  numeroControlo,
  indexarRelacoes,
  identificacaoDe,
} from '@/lib/validations/intercecao'
import type { PlanoDTO } from './validacoes-panel'
import type { RelacaoDTO } from './relacoes-panel'
import { formatDate, cn, iconButtonClasses } from '@/lib/utils'
import { ChevronDown, ChevronRight, Loader2, Plus, Pencil, Trash2, FileText, Timer } from 'lucide-react'
import type {
  TipoProdutoIntercecao,
  DirecaoProdutoIntercecao,
  TipoLinhaIntercecao,
  EstadoTranscricao,
} from '@/generated/prisma/enums'

interface LinhaRef {
  id: string
  codigo: string
  tipo: TipoLinhaIntercecao
  identificador: string
}

interface ProdutoItem {
  id: string
  tipo: TipoProdutoIntercecao
  numeroProduto: string | null
  idProduto: string | null
  direcao: DirecaoProdutoIntercecao | null
  data: string
  horaInicio: string | null
  horaFim: string | null
  duracao: string | null
  transcricao: EstadoTranscricao
  transcricaoEm: string | null
  de: string | null
  identificacaoDe: string | null
  para: string | null
  identificacaoPara: string | null
  resumo: string
  comentarios: string | null
  criadoPor: { id: string; nome: string }
  linha: LinhaRef | null
}

interface Props {
  nuipcSlug: string
  alvoId: string
  totalInicial: number
  linhas: LinhaRef[]
  relacoes: RelacaoDTO[]
  plano: PlanoDTO | null
  canEdit: boolean
}

interface ProdutoForm {
  tipo: TipoProdutoIntercecao
  linhaId: string
  numeroProduto: string
  idProduto: string
  direcao: '' | DirecaoProdutoIntercecao
  data: string
  horaInicio: string
  horaFim: string
  duracao: string
  transcricao: EstadoTranscricao
  de: string
  identificacaoDe: string
  para: string
  identificacaoPara: string
  resumo: string
  comentarios: string
}
const EMPTY_PRODUTO: ProdutoForm = {
  tipo: 'VOZ',
  linhaId: '',
  numeroProduto: '',
  idProduto: '',
  direcao: '',
  data: '',
  horaInicio: '',
  horaFim: '',
  duracao: '',
  transcricao: 'NENHUMA',
  de: '',
  identificacaoDe: '',
  para: '',
  identificacaoPara: '',
  resumo: '',
  comentarios: '',
}

const NONE = '__none__'

/**
 * Produtos de interesse de um alvo — sempre paginados on-demand (a árvore da
 * página só traz contagens): o painel carrega ao expandir e a cada mudança.
 */
export function ProdutosPanel({
  nuipcSlug,
  alvoId,
  totalInicial,
  linhas,
  relacoes,
  plano,
  canEdit,
}: Props) {
  const router = useRouter()
  const base = `/api/inqueritos/${nuipcSlug}/intercecoes`

  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ProdutoItem[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(totalInicial)
  const [totalPages, setTotalPages] = useState(1)

  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; id: string } | null>(null)
  const [form, setForm] = useState<ProdutoForm>(EMPTY_PRODUTO)
  const [saving, setSaving] = useState(false)

  // Identificação do "DE"/"PARA": a Relação manda, o texto manual é o recurso.
  const relacoesIndex = useMemo(() => indexarRelacoes(relacoes), [relacoes])

  // Datas de validação, para saber a que lote de controlo pertence cada
  // produto. São as que o servidor já gerou — o ecrã e o ficheiro exportado
  // numeram os controlos a partir da mesma lista, e não de dois cálculos.
  const datasValidacao = useMemo(
    () => (plano?.validacoes ?? []).map((v) => new Date(v.data)),
    [plano],
  )

  const load = useCallback(
    async (p: number) => {
      setLoading(true)
      try {
        const res = await fetch(`${base}/alvos/${alvoId}/produtos?page=${p}`)
        if (!res.ok) throw new Error()
        const data = await res.json()
        setItems(data.items ?? [])
        setTotal(data.total ?? 0)
        setTotalPages(data.totalPages ?? 1)
        setPage(p)
      } catch {
        toast.error('Erro ao carregar produtos')
      } finally {
        setLoading(false)
      }
    },
    [base, alvoId],
  )

  function toggleExpanded() {
    const next = !expanded
    setExpanded(next)
    if (next && items.length === 0) void load(1)
  }

  function openCreate() {
    setForm(EMPTY_PRODUTO)
    setDialog({ mode: 'create' })
  }
  function openEdit(pItem: ProdutoItem) {
    setForm({
      tipo: pItem.tipo,
      linhaId: pItem.linha?.id ?? '',
      numeroProduto: pItem.numeroProduto ?? '',
      idProduto: pItem.idProduto ?? '',
      direcao: pItem.direcao ?? '',
      data: pItem.data.slice(0, 10),
      horaInicio: pItem.horaInicio ?? '',
      horaFim: pItem.horaFim ?? '',
      duracao: pItem.duracao ?? '',
      transcricao: pItem.transcricao,
      de: pItem.de ?? '',
      identificacaoDe: pItem.identificacaoDe ?? '',
      para: pItem.para ?? '',
      identificacaoPara: pItem.identificacaoPara ?? '',
      resumo: pItem.resumo,
      comentarios: pItem.comentarios ?? '',
    })
    setDialog({ mode: 'edit', id: pItem.id })
  }

  // Identificação que as Relações já dão para os números escritos no diálogo:
  // quando existe, o campo manual fica bloqueado (a ficha é a fonte de verdade).
  const identDeForm = identificacaoDe(form.de || null, null, relacoesIndex)
  const identParaForm = identificacaoDe(form.para || null, null, relacoesIndex)

  async function handleSubmit() {
    if (!dialog) return
    setSaving(true)
    try {
      const payload = { ...form }
      const url =
        dialog.mode === 'create'
          ? `${base}/alvos/${alvoId}/produtos`
          : `${base}/produtos/${dialog.id}`
      const res = await fetch(url, {
        method: dialog.mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success(dialog.mode === 'create' ? 'Produto registado' : 'Produto atualizado')
      setDialog(null)
      await load(dialog.mode === 'create' ? 1 : page)
      router.refresh() // atualiza contagens server-side
    } catch {
      toast.error('Erro de rede')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(pItem: ProdutoItem) {
    if (!confirm('Eliminar este produto de interesse?')) return
    try {
      const res = await fetch(`${base}/produtos/${pItem.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao eliminar')
        return
      }
      toast.success('Produto eliminado')
      await load(page > 1 && items.length === 1 ? page - 1 : page)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    }
  }

  return (
    <div className="rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={toggleExpanded}
          className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground text-muted-foreground transition-colors"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Produtos de interesse
          <span className="text-xs font-normal">({total})</span>
        </button>
        {canEdit && (
          <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={openCreate}>
            <Plus className="h-3 w-3" /> Produto
          </Button>
        )}
      </div>

      {expanded && (
        <div className="border-t px-3 pb-3">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">
              Sem produtos de interesse registados.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Data</th>
                      <th className="py-1.5 pr-3 font-medium">Tipo</th>
                      <th className="py-1.5 pr-3 font-medium">N.º</th>
                      <th className="py-1.5 pr-3 font-medium">Direção</th>
                      <th className="py-1.5 pr-3 font-medium">Linha</th>
                      <th className="py-1.5 pr-3 font-medium">De → Para</th>
                      <th className="py-1.5 pr-3 font-medium">Resumo</th>
                      <th className="py-1.5 pr-3 font-medium">Transcrição</th>
                      {canEdit && <th className="py-1.5 font-medium sr-only">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((pItem, i) => {
                      // Separador de lote sempre que o controlo muda (a lista
                      // vem do mais recente para o mais antigo, por isso os
                      // números descem — o agrupamento mantém-se legível).
                      const controlo =
                        datasValidacao.length > 0
                          ? numeroControlo(new Date(pItem.data), datasValidacao)
                          : null
                      const anterior =
                        i > 0 && datasValidacao.length > 0
                          ? numeroControlo(new Date(items[i - 1].data), datasValidacao)
                          : null
                      const identDe = identificacaoDe(pItem.de, pItem.identificacaoDe, relacoesIndex)
                      const identPara = identificacaoDe(
                        pItem.para,
                        pItem.identificacaoPara,
                        relacoesIndex,
                      )
                      return (
                    <Fragment key={pItem.id}>
                      {controlo !== null && controlo !== anterior && (
                        <tr className="bg-muted/50">
                          <td
                            colSpan={canEdit ? 8 : 7}
                            className="py-1 px-1 text-xs font-semibold text-muted-foreground"
                          >
                            {controlo}.º Controlo
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {formatDate(pItem.data)}
                          {(pItem.horaInicio || pItem.horaFim) && (
                            <span className="text-xs text-muted-foreground ml-1">
                              {pItem.horaInicio ?? '?'}–{pItem.horaFim ?? '?'}
                            </span>
                          )}
                          {pItem.duracao && (
                            <span
                              className="text-xs text-muted-foreground ml-1 inline-flex items-center gap-0.5"
                              title="Duração"
                            >
                              <Timer className="h-3 w-3" />
                              {pItem.duracao}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium', TIPO_PRODUTO_BADGE[pItem.tipo])}>
                            {TIPO_PRODUTO_LABEL[pItem.tipo]}
                          </span>
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">
                          {pItem.numeroProduto ?? '—'}
                          {pItem.idProduto && (
                            <span
                              className="block text-[10px] text-muted-foreground truncate max-w-[110px]"
                              title={`ID do produto: ${pItem.idProduto}`}
                            >
                              {pItem.idProduto}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-xs">
                          {pItem.direcao ? DIRECAO_LABEL[pItem.direcao] : '—'}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-xs font-mono">
                          {pItem.linha ? pItem.linha.identificador : '—'}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-xs">
                          {pItem.de || pItem.para ? (
                            <>
                              <span className="font-mono">
                                {pItem.de ?? '?'} → {pItem.para ?? '?'}
                              </span>
                              {(identDe || identPara) && (
                                <span className="block text-[10px] text-muted-foreground">
                                  {identDe ?? '?'} → {identPara ?? '?'}
                                </span>
                              )}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 pr-3 max-w-[320px]">
                          <span className="block truncate" title={pItem.resumo}>
                            {pItem.resumo}
                          </span>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {temTranscricao(pItem.transcricao) ? (
                            <span
                              className={cn(
                                'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium',
                                TRANSCRICAO_BADGE[pItem.transcricao],
                              )}
                            >
                              <FileText className="h-3 w-3" />
                              {TRANSCRICAO_LABEL[pItem.transcricao]}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="py-2 whitespace-nowrap">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => openEdit(pItem)}
                                className={cn(iconButtonClasses, 'text-muted-foreground hover:text-foreground')}
                                title="Editar produto"
                                aria-label="Editar produto"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(pItem)}
                                className={cn(iconButtonClasses, 'text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30')}
                                title="Eliminar produto"
                                aria-label="Eliminar produto"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                  <span>
                    Página {page} de {totalPages}
                  </span>
                  <div className="flex gap-2">
                    {page > 1 && (
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => load(page - 1)}>
                        Anterior
                      </Button>
                    )}
                    {page < totalPages && (
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => load(page + 1)}>
                        Próxima
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Dialog produto */}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'edit' ? 'Editar produto' : 'Registar produto de interesse'}</DialogTitle>
          </DialogHeader>
          {/* Corpo rolável: cabeçalho e rodapé (Guardar/X) ficam fixos em mobile. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1 min-h-0 overflow-y-auto -mx-4 px-4">
            <div className="space-y-1.5">
              <Label>Tipo de produto *</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) => v && setForm({ ...form, tipo: v as TipoProdutoIntercecao })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) =>
                      v ? TIPO_PRODUTO_LABEL[v as TipoProdutoIntercecao] ?? v : 'Escolher…'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIPO_PRODUTO_VALUES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_PRODUTO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prodNumero">N.º produto</Label>
              <Input
                id="prodNumero"
                className="font-mono"
                placeholder="n.º da sessão"
                value={form.numeroProduto}
                onChange={(e) => setForm({ ...form, numeroProduto: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prodIdProduto">ID do produto</Label>
              <Input
                id="prodIdProduto"
                className="font-mono"
                placeholder="ID do sistema de interceção"
                value={form.idProduto}
                onChange={(e) => setForm({ ...form, idProduto: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Linha (alvo)</Label>
              <Select
                value={form.linhaId || NONE}
                onValueChange={(v) => setForm({ ...form, linhaId: !v || v === NONE ? '' : v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) => {
                      if (!v || v === NONE) return '—'
                      const l = linhas.find((x) => x.id === v)
                      return l ? `${TIPO_LINHA_LABEL[l.tipo]} ${l.identificador} (código ${l.codigo})` : '—'
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {linhas.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {TIPO_LINHA_LABEL[l.tipo]} {l.identificador} (código {l.codigo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Direção</Label>
              <Select
                value={form.direcao || NONE}
                onValueChange={(v) =>
                  setForm({ ...form, direcao: !v || v === NONE ? '' : (v as DirecaoProdutoIntercecao) })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) =>
                      !v || v === NONE ? '—' : DIRECAO_LABEL[v as DirecaoProdutoIntercecao] ?? '—'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {DIRECAO_VALUES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DIRECAO_LABEL[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prodData">Data *</Label>
              <Input
                id="prodData"
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="prodHoraInicio">Hora início</Label>
                {/* step=1 ativa os segundos no seletor nativo (hh:mm:ss). */}
                <Input
                  id="prodHoraInicio"
                  type="time"
                  step={1}
                  value={form.horaInicio}
                  onChange={(e) => setForm({ ...form, horaInicio: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prodHoraFim">Hora fim</Label>
                <Input
                  id="prodHoraFim"
                  type="time"
                  step={1}
                  value={form.horaFim}
                  onChange={(e) => setForm({ ...form, horaFim: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prodDuracao">Duração</Label>
              <Input
                id="prodDuracao"
                className="font-mono"
                placeholder="mm:ss (ex.: chamada)"
                value={form.duracao}
                onChange={(e) => setForm({ ...form, duracao: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">Formato mm:ss ou hh:mm:ss.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2">
              <div className="space-y-1.5">
                <Label htmlFor="prodDe">De</Label>
                <Input
                  id="prodDe"
                  className="font-mono"
                  value={form.de}
                  onChange={(e) => setForm({ ...form, de: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prodPara">Para</Label>
                <Input
                  id="prodPara"
                  className="font-mono"
                  value={form.para}
                  onChange={(e) => setForm({ ...form, para: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prodIdentDe">Identificação do &quot;De&quot;</Label>
                <Input
                  id="prodIdentDe"
                  placeholder={identDeForm ?? 'quem é este número'}
                  disabled={identDeForm !== null}
                  value={identDeForm ?? form.identificacaoDe}
                  onChange={(e) => setForm({ ...form, identificacaoDe: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prodIdentPara">Identificação do &quot;Para&quot;</Label>
                <Input
                  id="prodIdentPara"
                  placeholder={identParaForm ?? 'quem é este número'}
                  disabled={identParaForm !== null}
                  value={identParaForm ?? form.identificacaoPara}
                  onChange={(e) => setForm({ ...form, identificacaoPara: e.target.value })}
                />
              </div>
              {(identDeForm || identParaForm) && (
                <p className="col-span-2 text-[11px] text-muted-foreground">
                  Identificação preenchida pelas Relações do inquérito — para a alterar, edite a
                  ficha do contacto.
                </p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="prodResumo">Descrição / resumo *</Label>
              <Textarea
                id="prodResumo"
                rows={3}
                value={form.resumo}
                onChange={(e) => setForm({ ...form, resumo: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Transcrição
              </Label>
              <Select
                value={form.transcricao}
                onValueChange={(v) => v && setForm({ ...form, transcricao: v as EstadoTranscricao })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) =>
                      v ? TRANSCRICAO_LABEL[v as EstadoTranscricao] ?? v : '—'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TRANSCRICAO_VALUES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === 'NENHUMA' ? 'Sem transcrição' : TRANSCRICAO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Pedida → autorizada → transcrita. O relatório de transcrições inclui tudo o que não
                esteja em &quot;sem transcrição&quot;.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="prodComentarios">Comentários</Label>
              <Textarea
                id="prodComentarios"
                rows={2}
                value={form.comentarios}
                onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={saving || !form.resumo.trim() || !form.data}
            >
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
