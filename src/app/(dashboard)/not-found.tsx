import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * 404 dentro do dashboard — renderiza com a sidebar/header (a layout do
 * grupo envolve este boundary). Mostrado por `notFound()` quando um recurso
 * realmente não existe. Mensagem genérica de propósito: não revela se um
 * recurso específico (ex: NUIPC) existe ou não.
 */
export default function DashboardNotFound() {
  return (
    <div className="flex items-center justify-center py-16">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center text-center gap-4 pt-8 pb-8">
          <div className="rounded-full bg-muted p-3">
            <FileQuestion className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold tracking-tight">Página não encontrada</h1>
            <p className="text-sm text-muted-foreground">
              O recurso que procuras não existe, foi removido, ou o endereço está incorreto.
            </p>
          </div>
          <Link href="/dashboard" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Voltar ao dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
