import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * 404 global (fora do grupo dashboard) e fallback. Standalone — não depende
 * da layout do dashboard.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="flex flex-col items-center text-center gap-4 max-w-md">
        <div className="rounded-full bg-muted p-3">
          <FileQuestion className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Página não encontrada</h1>
        <p className="text-sm text-muted-foreground">
          O endereço que procuras não existe ou foi movido.
        </p>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
