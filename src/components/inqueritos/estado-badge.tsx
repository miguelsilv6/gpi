import { Badge } from '@/components/ui/badge'
import {
  ESTADO_COR_CLASSES,
  ESTADO_COR_DEFAULT,
  ESTADO_LABELS_FALLBACK,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

interface EstadoLike {
  codigo: string
  nome: string
  cor: string | null
}

export function EstadoBadge({ estado }: { estado: EstadoLike | null | undefined }) {
  if (!estado) return null
  const colorClass = estado.cor
    ? ESTADO_COR_CLASSES[estado.cor] ?? ESTADO_COR_DEFAULT
    : ESTADO_COR_DEFAULT
  const label = estado.nome || ESTADO_LABELS_FALLBACK[estado.codigo] || estado.codigo
  return (
    <Badge variant="outline" className={cn('text-[11px] font-medium', colorClass)}>
      {label}
    </Badge>
  )
}
