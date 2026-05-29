'use client'

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import Link from 'next/link'
import { EstadoBadge } from './estado-badge'
import { EtiquetaList } from './etiqueta-badge'
import { formatDate, isOverdue, nuipcToSlug } from '@/lib/utils'
import { AlertTriangle, Calendar, Check, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EstadoLike {
  codigo: string
  nome: string
  cor: string | null
  terminal: boolean
}

interface EtiquetaLike { id: string; nome: string }

interface InqueritoCardProps {
  nuipc: string
  nai?: string | null
  natureza: string
  estado: EstadoLike
  etiquetas?: EtiquetaLike[]
  dataPrazo: Date | null
  inspetorNome?: string | null
  atividadesCount?: number
  /**
   * Quando true, o card mostra checkbox e o tap toggle a seleção em vez
   * de navegar para o detalhe. Mobile only — em desktop a seleção é feita
   * via checkboxes da tabela (em vista md+).
   */
  selectionMode?: boolean
  isSelected?: boolean
  onToggle?: () => void
  /**
   * Disparado em long-press (500ms). Tipicamente activa o selectionMode
   * no parent e marca este card. O long-press é considerado enhancement:
   * utilizadores keyboard/screen-reader usam um botão explícito no header
   * da lista.
   */
  onLongPress?: () => void
}

const LONG_PRESS_MS = 500
const MOVE_THRESHOLD_PX = 10

/**
 * Hook privado para long-press num elemento. Cancela em pointer-up,
 * leave, cancel ou movimento > 10px (scroll). Quando dispara, marca
 * suppressNextClick para que o `onClick` que se segue ao release
 * possa ser intercepatdo (evita navegar para o detalhe).
 */
function useLongPress(onLongPress: (() => void) | undefined) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const suppressNextClickRef = useRef(false)

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startPosRef.current = null
  }, [])

  useEffect(() => () => cancel(), [cancel])

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!onLongPress) return
      // Botão direito do rato não conta
      if (e.button !== 0) return
      suppressNextClickRef.current = false
      startPosRef.current = { x: e.clientX, y: e.clientY }
      timerRef.current = setTimeout(() => {
        suppressNextClickRef.current = true
        onLongPress()
      }, LONG_PRESS_MS)
    },
    [onLongPress],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!startPosRef.current) return
      const dx = e.clientX - startPosRef.current.x
      const dy = e.clientY - startPosRef.current.y
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) cancel()
    },
    [cancel],
  )

  const consumeSuppressedClick = useCallback(() => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return true
    }
    return false
  }, [])

  return {
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
    },
    consumeSuppressedClick,
  }
}

export function InqueritoCard({
  nuipc,
  nai,
  natureza,
  estado,
  etiquetas = [],
  dataPrazo,
  inspetorNome,
  atividadesCount = 0,
  selectionMode = false,
  isSelected = false,
  onToggle,
  onLongPress,
}: InqueritoCardProps) {
  const overdue = isOverdue(dataPrazo) && !estado.terminal

  const { pointerHandlers, consumeSuppressedClick } = useLongPress(onLongPress)

  const handleClick = (e: MouseEvent) => {
    // Long-press disparou — não navegar.
    if (consumeSuppressedClick()) {
      e.preventDefault()
      return
    }
    // Em modo selecção, tap é toggle em vez de navegação.
    if (selectionMode && onToggle) {
      e.preventDefault()
      onToggle()
    }
  }

  return (
    <Link
      href={`/inqueritos/${nuipcToSlug(nuipc)}`}
      onClick={handleClick}
      onContextMenu={onLongPress ? (e) => e.preventDefault() : undefined}
      {...pointerHandlers}
      className={cn(
        'relative block p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors',
        selectionMode && 'select-none',
        // Em selectionMode, indicamos visualmente o estado de seleção
        selectionMode && isSelected && 'border-blue-500 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/30',
        // Touch-action evita que o browser dispare o context menu / text-select
        // durante o long-press.
        selectionMode || onLongPress ? 'touch-pan-y' : '',
      )}
      role={selectionMode ? 'checkbox' : undefined}
      aria-checked={selectionMode ? isSelected : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {selectionMode && (
            <div
              className={cn(
                'mt-0.5 h-5 w-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors',
                isSelected
                  ? 'bg-blue-600 border-blue-600'
                  : 'border-muted-foreground/40 bg-background',
              )}
              aria-hidden
            >
              {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold">{nuipc}</span>
              {overdue && (
                <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
              )}
            </div>
            {nai && (
              <p className="text-xs font-mono text-muted-foreground mt-0.5">NAI: {nai}</p>
            )}
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{natureza}</p>
            {etiquetas.length > 0 && (
              <EtiquetaList etiquetas={etiquetas} max={3} className="mt-1.5" />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end shrink-0">
          <EstadoBadge estado={estado} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {inspetorNome && (
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {inspetorNome}
          </span>
        )}
        {dataPrazo && (
          <span className={cn('flex items-center gap-1', overdue && 'text-red-600 font-medium')}>
            <Calendar className="h-3 w-3" />
            {formatDate(dataPrazo)}
          </span>
        )}
        {atividadesCount > 0 && (
          <span>{atividadesCount} atividade{atividadesCount !== 1 ? 's' : ''}</span>
        )}
      </div>
    </Link>
  )
}
