'use client'

import { useMemo, useOptimistic, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Markdown } from '@/components/ui/markdown'
import {
  Circle,
  CheckCircle2,
  FolderOpen,
  ArrowUpRight,
  Search,
  CheckSquare,
  ChevronDown,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { PrioridadeTarefa } from '@/generated/prisma/enums'
import { PRIORIDADE_LABEL, PRIORIDADE_COLOR } from '@/components/tarefas/tarefa-shared'

export interface TarefaBrowserItem {
  id: string
  titulo: string
  descricao: string | null
  prioridade: PrioridadeTarefa
  concluida: boolean
  concluidaEm: string | null
  createdAt: string
  inquerito: { nuipc: string; slug: string; natureza: string | null }
}

interface Props {
  tarefas: TarefaBrowserItem[]
}

type Filtro = 'pendentes' | 'concluidas' | 'todas'
type FiltroP = 'todas' | PrioridadeTarefa

export function TarefasBrowser({ tarefas: initial }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('pendentes')
  const [filtroPrioridade, setFiltroPrioridade] = useState<FiltroP>('todas')
  const [toggling, setToggling] = useState<string | null>(null)

  // Optimistic update para toggle de conclusão (resposta imediata ao clicar).
  const [tarefas, addOptimistic] = useOptimistic(
    initial,
    (state, id: string) =>
      state.map((t) => t.id === id ? { ...t, concluida: !t.concluida } : t),
  )
  const [, startTransition] = useTransition()

  async function handleToggle(t: TarefaBrowserItem) {
    setToggling(t.id)
    startTransition(() => addOptimistic(t.id))
    try {
      const res = await fetch(`/api/tarefas/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concluida: !t.concluida }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao atualizar a tarefa')
      } else {
        router.refresh()
      }
    } catch {
      toast.error('Erro de rede ao atualizar a tarefa')
    } finally {
      setToggling(null)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tarefas.filter((t) => {
      if (filtro === 'pendentes' && t.concluida) return false
      if (filtro === 'concluidas' && !t.concluida) return false
      if (filtroPrioridade !== 'todas' && t.prioridade !== filtroPrioridade) return false
      if (q && !t.titulo.toLowerCase().includes(q) && !t.inquerito.nuipc.toLowerCase().includes(q) && !(t.descricao?.toLowerCase().includes(q) ?? false)) return false
      return true
    })
  }, [tarefas, filtro, filtroPrioridade, query])

  // Agrupa por inquérito preservando a ordem (prioridade desc, mais recente).
  const groups = useMemo(() => {
    const map = new Map<string, { nuipc: string; slug: string; natureza: string | null; tarefas: TarefaBrowserItem[] }>()
    for (const t of filtered) {
      const key = t.inquerito.nuipc
      if (!map.has(key)) map.set(key, { ...t.inquerito, tarefas: [] })
      map.get(key)!.tarefas.push(t)
    }
    return Array.from(map.values())
  }, [filtered])

  const pendentesTotal = tarefas.filter((t) => !t.concluida).length
  const concluidasTotal = tarefas.filter((t) => t.concluida).length

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar tarefa ou NUIPC…" className="pl-9" />
        </div>
        <div className="flex rounded-md border divide-x overflow-hidden">
          {([['pendentes', `Pendentes (${pendentesTotal})`], ['concluidas', `Concluídas (${concluidasTotal})`], ['todas', 'Todas']] as [Filtro, string][]).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFiltro(v)}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${filtro === v ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border divide-x overflow-hidden">
          {([['todas', 'Prioridade'], ['ALTA', 'Alta'], ['NORMAL', 'Normal'], ['BAIXA', 'Baixa']] as [FiltroP, string][]).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFiltroPrioridade(v)}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${filtroPrioridade === v ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? 'tarefa' : 'tarefas'} · {groups.length} {groups.length === 1 ? 'inquérito' : 'inquéritos'}
      </p>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <CheckSquare className="mb-3 h-10 w-10 opacity-40" />
          <p className="text-sm">
            {query || filtro !== 'pendentes' || filtroPrioridade !== 'todas'
              ? 'Nenhuma tarefa corresponde aos filtros.'
              : 'Não tem tarefas pendentes. Bom trabalho!'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.nuipc}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{g.nuipc}</span>
                    {g.natureza && <span className="truncate text-xs font-normal text-muted-foreground">· {g.natureza}</span>}
                  </span>
                  <Link href={`/inqueritos/${g.slug}`} className="flex shrink-0 items-center gap-1 text-xs font-normal text-primary hover:underline">
                    Abrir <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {g.tarefas.map((t) => (
                  <div key={t.id} className={`rounded-lg border px-3 py-2 ${t.concluida ? 'bg-muted/10 opacity-70' : 'bg-muted/20'}`}>
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                        title={t.concluida ? 'Reabrir tarefa' : 'Marcar como concluída'}
                        onClick={() => handleToggle(t)}
                        disabled={toggling === t.id}
                      >
                        {toggling === t.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : t.concluida
                            ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                            : <Circle className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium break-words ${t.concluida ? 'line-through text-muted-foreground' : ''}`}>
                          {t.titulo}
                          <span className={`ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${PRIORIDADE_COLOR[t.prioridade]}`}>
                            {PRIORIDADE_LABEL[t.prioridade]}
                          </span>
                        </p>
                        {t.descricao && !t.concluida && (
                          <div className="mt-1"><Markdown content={t.descricao} /></div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
