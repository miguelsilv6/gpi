'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface InqueritoOption {
  id: string
  nuipc: string
}

function NuipcCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (nuipc: string) => void
}) {
  const [query, setQuery] = useState(value)
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
        // network error — silently ignore, dropdown stays closed
      } finally {
        if (active) setLoading(false)
      }
    }, 250)
    return () => {
      active = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(opt: InqueritoOption) {
    setQuery(opt.nuipc)
    onChange(opt.nuipc)
    setOpen(false)
  }

  function clear() {
    setQuery('')
    onChange('')
    setOptions([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => {
            const val = e.target.value.toUpperCase()
            setQuery(val)
            onChange(val)
          }}
          placeholder="Ex: 123/25.4GBCBR"
          className="pl-8 pr-8"
          maxLength={50}
          autoComplete="off"
        />
        {(query || loading) && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {loading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <X className="h-3.5 w-3.5" />
            }
          </button>
        )}
      </div>
      {open && options.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 rounded-lg border bg-popover shadow-md overflow-hidden text-sm">
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                onMouseDown={() => select(opt)}
                className={cn(
                  'w-full text-left px-3 py-2 font-mono hover:bg-accent transition-colors',
                  query === opt.nuipc && 'bg-accent',
                )}
              >
                {opt.nuipc}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && options.length === 0 && !loading && query.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 rounded-lg border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
          Sem resultados
        </div>
      )}
    </div>
  )
}

export function CreateControloDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [descricao, setDescricao] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [nuipc, setNuipc] = useState('')
  const [dataInicio, setDataInicio] = useState(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [periodico, setPeriodico] = useState(false)
  const [periodoDias, setPeriodoDias] = useState('15')
  const [alertaDias, setAlertaDias] = useState('3')

  function reset() {
    setDescricao('')
    setObservacoes('')
    setNuipc('')
    const now = new Date()
    setDataInicio(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    )
    setPeriodico(false)
    setPeriodoDias('15')
    setAlertaDias('3')
  }

  async function submit() {
    if (!descricao.trim()) {
      toast.error('A descrição é obrigatória')
      return
    }
    if (!dataInicio) {
      toast.error('A data de início é obrigatória')
      return
    }

    const alertaDiasNum = parseInt(alertaDias, 10)
    if (isNaN(alertaDiasNum) || alertaDiasNum < 1 || alertaDiasNum > 90) {
      toast.error('Dias de alerta deve ser entre 1 e 90')
      return
    }

    let periodoDiasNum: number | null = null
    if (periodico) {
      periodoDiasNum = parseInt(periodoDias, 10)
      if (isNaN(periodoDiasNum) || periodoDiasNum < 1 || periodoDiasNum > 365) {
        toast.error('Período deve ser entre 1 e 365 dias')
        return
      }
    }

    setLoading(true)
    try {
      const res = await fetch('/api/controlos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: descricao.trim(),
          observacoes: observacoes.trim() || null,
          dataInicio,
          periodoDias: periodoDiasNum,
          alertaDias: alertaDiasNum,
          nuipc: nuipc.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao criar controlo')
        return
      }
      toast.success('Controlo criado')
      reset()
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede ao criar controlo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Novo controlo
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo controlo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cc-descricao">Descrição *</Label>
              <Input
                id="cc-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Entrega de relatório intercalar"
                maxLength={500}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc-nuipc">NUIPC (opcional)</Label>
              <NuipcCombobox value={nuipc} onChange={setNuipc} />
              <p className="text-xs text-muted-foreground">
                Pesquisa os seus inquéritos à medida que escreve. Deixe vazio para um controlo independente.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc-data">Data de início *</Label>
              <Input
                id="cc-data"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  id="cc-periodico"
                  type="checkbox"
                  checked={periodico}
                  onChange={(e) => setPeriodico(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="cc-periodico" className="cursor-pointer">
                  Controlo periódico (recorrente)
                </Label>
              </div>
              {periodico && (
                <div className="pl-6 space-y-1.5">
                  <Label htmlFor="cc-periodo">Período (dias)</Label>
                  <Input
                    id="cc-periodo"
                    type="number"
                    min={1}
                    max={365}
                    value={periodoDias}
                    onChange={(e) => setPeriodoDias(e.target.value)}
                    className="max-w-[120px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Após cada confirmação, o próximo controlo é agendado automaticamente.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc-alerta">Alertar com antecedência (dias)</Label>
              <Input
                id="cc-alerta"
                type="number"
                min={1}
                max={90}
                value={alertaDias}
                onChange={(e) => setAlertaDias(e.target.value)}
                className="max-w-[120px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cc-obs">Observações (opcional)</Label>
              <Textarea
                id="cc-obs"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                placeholder="Observações adicionais..."
                maxLength={2000}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setOpen(false); reset() }}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button onClick={submit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar controlo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
