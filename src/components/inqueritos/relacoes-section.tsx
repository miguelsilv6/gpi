'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { Link2, Plus, Trash2, Loader2, X, Send, ChevronDown, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { TipoRelacaoInquerito } from '@/generated/prisma/enums'
import {
  TIPO_RELACAO_LABEL,
  TIPO_RELACAO_DESC,
  TIPO_RELACAO_VALUES,
  RELACAO_NOTA_MAX,
} from '@/lib/validations/inquerito-relacao'

export interface RelacaoItem {
  relacaoId: string
  tipo: TipoRelacaoInquerito
  nota: string | null
  inquerito: {
    nuipc: string
    slug: string
    crimeNome: string
    estadoNome: string
  }
}

interface InqueritoOption {
  id: string
  nuipc: string
}

interface Props {
  nuipcSlug: string
  selfNuipc: string
  relacoes: RelacaoItem[]
  canEdit: boolean
}

const TIPO_BADGE: Record<TipoRelacaoInquerito, string> = {
  RELACIONADO: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  APENSO: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  CONEXO: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300',
}

export function RelacoesSection({ nuipcSlug, selfNuipc, relacoes, canEdit }: Props) {
  const router = useRouter()

  const [composing, setComposing] = useState(false)
  const [selected, setSelected] = useState<InqueritoOption | null>(null)
  const [tipo, setTipo] = useState<TipoRelacaoInquerito>('RELACIONADO')
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)

  const [toDelete, setToDelete] = useState<RelacaoItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  function resetCompose() {
    setComposing(false)
    setSelected(null)
    setTipo('RELACIONADO')
    setNota('')
  }

  async function handleAdd() {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch(`/api/inqueritos/${nuipcSlug}/relacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinoId: selected.id, tipo, nota: nota.trim() || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao ligar o inquérito')
        return
      }
      toast.success('Inquérito ligado')
      resetCompose()
      router.refresh()
    } catch {
      toast.error('Erro de rede ao ligar o inquérito')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/inqueritos/${nuipcSlug}/relacoes/${toDelete.relacaoId}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao remover a ligação')
        return
      }
      toast.success('Ligação removida')
      setToDelete(null)
      router.refresh()
    } catch {
      toast.error('Erro de rede ao remover a ligação')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Inquéritos relacionados
          {relacoes.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({relacoes.length})</span>
          )}
        </CardTitle>
        <HelpButton title="Ajuda — Inquéritos relacionados">
          <HelpSection title="O que é">
            <p>Liga este inquérito a outros (apensos, conexões ou relações genéricas de investigação). A ligação é simétrica: aparece em ambos os inquéritos.</p>
          </HelpSection>
          <HelpSection title="Âmbito">
            <p>Só pode ligar a inquéritos a que tem acesso. Ligações para inquéritos fora do seu âmbito não são mostradas.</p>
          </HelpSection>
        </HelpButton>
      </CardHeader>

      <CardContent className="space-y-3">
        {canEdit && (
          composing ? (
            <div className="space-y-2 rounded-lg border bg-muted/10 p-3">
              <InqueritoCombobox selfNuipc={selfNuipc} value={selected} onChange={setSelected} />
              <div className="flex items-center gap-2 flex-wrap">
                <TipoSelector value={tipo} onChange={setTipo} />
                <Input
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  maxLength={RELACAO_NOTA_MAX}
                  placeholder="Nota (opcional)"
                  className="flex-1 min-w-[12rem]"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={resetCompose} disabled={saving}>Cancelar</Button>
                <Button size="sm" className="gap-1.5" disabled={saving || !selected} onClick={handleAdd}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Ligar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setComposing(true)}>
              <Plus className="h-3.5 w-3.5" /> Ligar inquérito
            </Button>
          )
        )}

        {relacoes.length === 0 && (
          <p className="text-sm text-muted-foreground py-1">Sem inquéritos relacionados.</p>
        )}

        {relacoes.length > 0 && (
          <ul className="space-y-1.5">
            {relacoes.map((r) => (
              <li key={r.relacaoId} className="rounded-lg border bg-muted/20 px-3 py-2">
                <div className="flex items-start gap-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/inqueritos/${r.inquerito.slug}`}
                        className="font-mono text-sm font-medium hover:underline"
                      >
                        {r.inquerito.nuipc}
                      </Link>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${TIPO_BADGE[r.tipo]}`}>
                        {TIPO_RELACAO_LABEL[r.tipo]}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{r.inquerito.estadoNome}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.inquerito.crimeNome}</p>
                    {r.nota && <p className="text-xs mt-1 whitespace-pre-wrap">{r.nota}</p>}
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                      title="Remover ligação"
                      onClick={() => setToDelete(r)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!toDelete} onOpenChange={(v) => { if (!v) setToDelete(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remover ligação?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            A ligação a <span className="font-mono">{toDelete?.inquerito.nuipc}</span> será removida. Esta ação não elimina nenhum inquérito.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function TipoSelector({ value, onChange }: { value: TipoRelacaoInquerito; onChange: (v: TipoRelacaoInquerito) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium shadow-xs hover:bg-accent">
        {TIPO_RELACAO_LABEL[value]}
        <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {TIPO_RELACAO_VALUES.map((t) => (
          <DropdownMenuItem key={t} onClick={() => onChange(t)} className="flex flex-col items-start gap-0.5">
            <span className="font-medium">{TIPO_RELACAO_LABEL[t]}</span>
            <span className="text-xs text-muted-foreground">{TIPO_RELACAO_DESC[t]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Combobox que pesquisa inquéritos (autocomplete por NUIPC) e devolve o id. */
function InqueritoCombobox({
  selfNuipc,
  value,
  onChange,
}: {
  selfNuipc: string
  value: InqueritoOption | null
  onChange: (opt: InqueritoOption | null) => void
}) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<InqueritoOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setOptions([])
      setOpen(false)
      return () => { active = false }
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/inqueritos/autocomplete?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        if (active) {
          // Exclui o próprio inquérito das sugestões.
          setOptions((Array.isArray(data) ? data : []).filter((o: InqueritoOption) => o.nuipc !== selfNuipc))
          setOpen(true)
        }
      } catch {
        // erro de rede — dropdown fica fechado
      } finally {
        if (active) setLoading(false)
      }
    }, 250)
    return () => {
      active = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, selfNuipc])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm">
        <span className="font-mono">{value.nuipc}</span>
        <button
          type="button"
          className="ml-auto text-muted-foreground hover:text-foreground"
          onClick={() => { onChange(null); setQuery('') }}
          title="Mudar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-md border bg-background px-3">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar inquérito por NUIPC…"
          className="flex-1 bg-transparent py-1.5 text-sm outline-none"
          autoFocus
        />
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {open && options.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left font-mono text-sm hover:bg-accent"
                onClick={() => { onChange(o); setOpen(false) }}
              >
                {o.nuipc}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && options.length === 0 && query.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-2 text-xs text-muted-foreground shadow-md">
          Nenhum inquérito encontrado.
        </div>
      )}
    </div>
  )
}
