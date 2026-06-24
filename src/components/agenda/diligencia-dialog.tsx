'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Send, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import type { AgendaEvent } from '@/lib/agenda'
import type { TipoDiligencia } from '@/generated/prisma/enums'
import {
  TIPO_DILIGENCIA_VALUES,
  TIPO_DILIGENCIA_LABEL,
  DILIGENCIA_TITULO_MAX,
  DILIGENCIA_LOCAL_MAX,
  DILIGENCIA_OBS_MAX,
} from '@/lib/validations/diligencia'

interface InqueritoOption {
  id: string
  nuipc: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Quando presente (tem diligenciaId), o diálogo está em modo de edição. */
  existing?: AgendaEvent | null
  /** Dia pré-selecionado no calendário (modo de criação). */
  defaultDay?: Date | null
}

/** Date → "YYYY-MM-DDTHH:mm" em hora local (para <input type="datetime-local">). */
function toDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function DiligenciaDialog({ open, onOpenChange, existing, defaultDay }: Props) {
  const router = useRouter()
  const isEdit = !!existing?.diligenciaId

  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<TipoDiligencia>('OUTRA')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [local, setLocal] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [concluida, setConcluida] = useState(false)
  const [inquerito, setInquerito] = useState<InqueritoOption | null>(null)
  const [saving, setSaving] = useState(false)

  // (Re)inicializa o formulário sempre que o diálogo abre.
  useEffect(() => {
    if (!open) return
    if (existing?.diligenciaId) {
      setTitulo(existing.titulo)
      setTipo((existing.subtipo as TipoDiligencia) ?? 'OUTRA')
      setDataInicio(existing.data ? toDatetimeLocal(new Date(existing.data)) : '')
      setDataFim(existing.dataFim ? toDatetimeLocal(new Date(existing.dataFim)) : '')
      setLocal(existing.local ?? '')
      setObservacoes(existing.observacoes ?? '')
      setConcluida(existing.concluido)
      setInquerito(existing.inqueritoId && existing.nuipc ? { id: existing.inqueritoId, nuipc: existing.nuipc } : null)
    } else {
      const base = defaultDay ? new Date(defaultDay) : new Date()
      if (defaultDay) base.setHours(9, 0, 0, 0)
      setTitulo('')
      setTipo('OUTRA')
      setDataInicio(toDatetimeLocal(base))
      setDataFim('')
      setLocal('')
      setObservacoes('')
      setConcluida(false)
      setInquerito(null)
    }
  }, [open, existing, defaultDay])

  async function handleSave() {
    if (!titulo.trim() || !dataInicio) return
    setSaving(true)
    try {
      const payload = {
        titulo: titulo.trim(),
        tipo,
        dataInicio,
        dataFim: dataFim || '',
        local: local.trim(),
        observacoes: observacoes.trim(),
        inqueritoId: inquerito?.id ?? '',
        ...(isEdit ? { concluida } : {}),
      }
      const res = await fetch(
        isEdit ? `/api/diligencias/${existing!.diligenciaId}` : '/api/diligencias',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar a diligência')
        return
      }
      toast.success(isEdit ? 'Diligência atualizada' : 'Diligência criada')
      onOpenChange(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede ao guardar a diligência')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar diligência' : 'Nova diligência'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="dil-titulo" className="text-xs">Título</Label>
            <Input
              id="dil-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={DILIGENCIA_TITULO_MAX}
              placeholder="Ex.: Julgamento — Tribunal de Lisboa"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDiligencia)}>
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue>
                    {(v: string) => TIPO_DILIGENCIA_LABEL[v as TipoDiligencia] ?? 'Tipo'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIPO_DILIGENCIA_VALUES.map((t) => (
                    <SelectItem key={t} value={t}>{TIPO_DILIGENCIA_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dil-local" className="text-xs">Local</Label>
              <Input
                id="dil-local"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                maxLength={DILIGENCIA_LOCAL_MAX}
                placeholder="Local (opcional)"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="dil-inicio" className="text-xs">Início</Label>
              <Input
                id="dil-inicio"
                type="datetime-local"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dil-fim" className="text-xs">Fim (opcional)</Label>
              <Input
                id="dil-fim"
                type="datetime-local"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Inquérito (opcional)</Label>
            <InqueritoCombobox value={inquerito} onChange={setInquerito} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="dil-obs" className="text-xs">Observações</Label>
            <Textarea
              id="dil-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              maxLength={DILIGENCIA_OBS_MAX}
              rows={3}
              placeholder="Notas (opcional)"
            />
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={concluida}
                onChange={(e) => setConcluida(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Marcar como concluída
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !titulo.trim() || !dataInicio} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isEdit ? 'Guardar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Combobox de pesquisa de inquérito por NUIPC (autocomplete). */
function InqueritoCombobox({
  value,
  onChange,
}: {
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
          setOptions(Array.isArray(data) ? data : [])
          setOpen(true)
        }
      } catch {
        // erro de rede — mantém fechado
      } finally {
        if (active) setLoading(false)
      }
    }, 250)
    return () => {
      active = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

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
          title="Remover ligação"
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
    </div>
  )
}
