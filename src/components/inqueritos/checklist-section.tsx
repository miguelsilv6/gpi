import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ChecklistView } from '@/lib/checklist'
import { cn } from '@/lib/utils'
import { ListChecks, CheckCircle2, Circle } from 'lucide-react'

/**
 * Checklist do crime — diligências-padrão esperadas para este tipo de crime.
 * Um item fica feito automaticamente quando existe pelo menos uma atividade
 * registada com esse nome (sem estado próprio). Configura-se por crime na
 * gestão de crimes (Configurações).
 */
export function ChecklistSection({ checklist }: { checklist: ChecklistView | null }) {
  if (!checklist || checklist.total === 0) return null
  const completa = checklist.done === checklist.total

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
          <ListChecks className="h-4 w-4" />
          Checklist do crime
          <span
            className={cn(
              'ml-auto font-semibold tabular-nums',
              completa ? 'text-green-600 dark:text-green-400' : 'text-foreground',
            )}
          >
            {checklist.done}/{checklist.total}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {checklist.items.map((item) => (
            <li key={item.atividadePadraoId} className="flex items-start gap-2 text-sm">
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
              ) : (
                <Circle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/50" />
              )}
              <span className={cn('min-w-0 break-words', item.done && 'text-muted-foreground')}>
                {item.nome}
                {item.count > 1 && (
                  <span className="text-xs text-muted-foreground"> ×{item.count}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Diligências esperadas para este tipo de crime — um item fica feito ao
          registar uma atividade com esse nome.
        </p>
      </CardContent>
    </Card>
  )
}
