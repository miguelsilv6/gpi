'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { cn, formatDate, isOverdue } from '@/lib/utils'
import { Lock, GripVertical } from 'lucide-react'

/**
 * Vista Kanban dos inquéritos — colunas pelos estados ativos (ordem do
 * catálogo). Drag&drop nativo HTML5, sem dependências.
 *
 * Regras (as mesmas da máquina de estados do servidor):
 *   - arrastar exige permissão bulk (chefe e acima) — o INSPETOR vê em
 *     leitura;
 *   - cartões em estado terminal não se arrastam (reabrir tem fluxo próprio
 *     com motivo, no detalhe do inquérito);
 *   - não se pode largar em colunas de estados terminais (o fecho exige
 *     data de conclusão — faz-se no formulário de edição).
 * A mudança vai pelo endpoint bulk changeState (validado + auditado).
 */

export interface KanbanCard {
  id: string
  nuipc: string
  slug: string
  crimeNome: string
  inspetorNome: string | null
  brigadaNome: string | null
  dataPrazo: string | null
}

export interface KanbanColuna {
  estadoId: string
  codigo: string
  nome: string
  cor: string | null
  terminal: boolean
  total: number
  cards: KanbanCard[]
}

interface Props {
  colunas: KanbanColuna[]
  canDrag: boolean
  showInspetor: boolean
}

export function KanbanBoard({ colunas: colunasIniciais, canDrag, showInspetor }: Props) {
  const router = useRouter()
  const [colunas, setColunas] = useState(colunasIniciais)
  const [dragging, setDragging] = useState<{ cardId: string; fromEstadoId: string } | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function moveLocal(cardId: string, fromEstadoId: string, toEstadoId: string) {
    setColunas((prev) => {
      const card = prev.find((c) => c.estadoId === fromEstadoId)?.cards.find((k) => k.id === cardId)
      if (!card) return prev
      return prev.map((col) => {
        if (col.estadoId === fromEstadoId) {
          return { ...col, total: col.total - 1, cards: col.cards.filter((k) => k.id !== cardId) }
        }
        if (col.estadoId === toEstadoId) {
          return { ...col, total: col.total + 1, cards: [card, ...col.cards] }
        }
        return col
      })
    })
  }

  async function handleDrop(toEstadoId: string) {
    setOverCol(null)
    const drag = dragging
    setDragging(null)
    if (!drag || pending) return
    if (drag.fromEstadoId === toEstadoId) return

    // Otimista + revert em erro.
    moveLocal(drag.cardId, drag.fromEstadoId, toEstadoId)
    setPending(true)
    try {
      const res = await fetch('/api/inqueritos/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [drag.cardId], action: 'changeState', estadoId: toEstadoId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Erro ao mudar o estado')
      }
      const nome = colunas.find((c) => c.estadoId === toEstadoId)?.nome ?? ''
      toast.success(`Inquérito movido para «${nome}»`)
      router.refresh()
    } catch (err) {
      moveLocal(drag.cardId, toEstadoId, drag.fromEstadoId)
      toast.error(err instanceof Error ? err.message : 'Erro ao mudar o estado')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 items-start">
      {colunas.map((col) => {
        const dropAllowed =
          canDrag && !col.terminal && dragging !== null && dragging.fromEstadoId !== col.estadoId
        return (
          <div
            key={col.estadoId}
            className={cn(
              'w-72 shrink-0 rounded-xl border bg-muted/30 transition-colors',
              overCol === col.estadoId && dropAllowed && 'border-primary bg-primary/5',
            )}
            onDragOver={(e) => {
              if (!dropAllowed) return
              e.preventDefault()
              setOverCol(col.estadoId)
            }}
            onDragLeave={() => setOverCol((cur) => (cur === col.estadoId ? null : cur))}
            onDrop={(e) => {
              if (!dropAllowed) return
              e.preventDefault()
              handleDrop(col.estadoId)
            }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 border-b">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: col.cor ?? 'var(--muted-foreground)' }}
                aria-hidden
              />
              <p className="text-sm font-medium truncate">{col.nome}</p>
              {col.terminal && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{col.total}</span>
            </div>

            <div className="p-2 space-y-2 min-h-16">
              {col.cards.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Sem inquéritos.</p>
              ) : (
                col.cards.map((card) => {
                  const draggable = canDrag && !col.terminal
                  return (
                    <div
                      key={card.id}
                      draggable={draggable}
                      onDragStart={(e) => {
                        if (!draggable) return
                        e.dataTransfer.effectAllowed = 'move'
                        setDragging({ cardId: card.id, fromEstadoId: col.estadoId })
                      }}
                      onDragEnd={() => {
                        setDragging(null)
                        setOverCol(null)
                      }}
                      className={cn(
                        'rounded-lg border bg-card p-2.5 shadow-sm',
                        draggable && 'cursor-grab active:cursor-grabbing',
                        dragging?.cardId === card.id && 'opacity-50',
                      )}
                    >
                      <div className="flex items-start gap-1.5">
                        {draggable && (
                          <GripVertical className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/50" />
                        )}
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/inqueritos/${card.slug}`}
                            className="font-mono text-sm font-medium hover:underline break-all"
                            draggable={false}
                          >
                            {card.nuipc}
                          </Link>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {card.crimeNome}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {showInspetor && card.inspetorNome && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 max-w-36 truncate">
                                {card.inspetorNome}
                              </Badge>
                            )}
                            {card.dataPrazo && (
                              <span
                                className={cn(
                                  'text-[10px]',
                                  !col.terminal && isOverdue(card.dataPrazo)
                                    ? 'text-red-600 dark:text-red-400 font-medium'
                                    : 'text-muted-foreground',
                                )}
                              >
                                Prazo: {formatDate(card.dataPrazo)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              {col.total > col.cards.length && (
                <Link
                  href={`/inqueritos?estado=${encodeURIComponent(col.codigo)}`}
                  className="block text-center text-xs text-primary hover:underline py-1"
                >
                  Ver todos ({col.total}) →
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
