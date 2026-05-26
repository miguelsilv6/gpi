import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Aviso de acesso negado (403). Renderizado inline por páginas/recursos a
 * que o utilizador autenticado não tem privilégios — em vez de um redirect
 * silencioso para o dashboard ou de um 404 enganoso.
 *
 * Para recursos que NÃO existem, usar `notFound()` (404) — não este
 * componente — para não revelar a sua existência.
 */
export function AccessDenied({
  title = 'Sem permissões',
  message = 'Não dispões de privilégios para aceder a esta página.',
  backHref = '/dashboard',
  backLabel = 'Voltar ao dashboard',
}: {
  title?: string
  message?: string
  backHref?: string
  backLabel?: string
}) {
  return (
    <div className="flex items-center justify-center py-16">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center text-center gap-4 pt-8 pb-8">
          <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-3">
            <ShieldAlert className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          <Link href={backHref} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            {backLabel}
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
