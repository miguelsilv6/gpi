import { Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EtiquetaLike {
  id: string
  nome: string
}

/**
 * Badge de etiqueta (tag) pessoal. Forma e ícone próprios (rectângulo
 * arredondado + ícone Tag) para não se confundir com os badges de estado
 * (pílulas coloridas) nem com os de movimento/atividade.
 */
export function EtiquetaBadge({ nome, className }: { nome: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground',
        className,
      )}
    >
      <Tag className="h-3 w-3 shrink-0 opacity-70" />
      <span className="truncate">{nome}</span>
    </span>
  )
}

/**
 * Renderiza uma lista de etiquetas com limite visível. Mostra até `max`
 * etiquetas e um indicador "+N" para as restantes ("uma tag ou as que a
 * janela permitir").
 */
export function EtiquetaList({
  etiquetas,
  max = 3,
  className,
}: {
  etiquetas: EtiquetaLike[]
  max?: number
  className?: string
}) {
  if (!etiquetas || etiquetas.length === 0) return null
  const shown = etiquetas.slice(0, max)
  const extra = etiquetas.length - shown.length
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {shown.map((e) => (
        <EtiquetaBadge key={e.id} nome={e.nome} />
      ))}
      {extra > 0 && (
        <span className="text-[11px] text-muted-foreground" title={`Mais ${extra} etiqueta(s)`}>
          +{extra}
        </span>
      )}
    </div>
  )
}
