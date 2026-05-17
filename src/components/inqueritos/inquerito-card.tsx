import Link from 'next/link'
import { EstadoBadge } from './estado-badge'
import { FaseBadge } from './fase-badge'
import { formatDate, isOverdue, nuipcToSlug } from '@/lib/utils'
import { AlertTriangle, Calendar, User } from 'lucide-react'
import type { FaseProcessual } from '@/generated/prisma/enums'
import { cn } from '@/lib/utils'

interface EstadoLike {
  codigo: string
  nome: string
  cor: string | null
  terminal: boolean
}

interface InqueritoCardProps {
  nuipc: string
  nai?: string | null
  natureza: string
  estado: EstadoLike
  faseProcessual: FaseProcessual
  dataPrazo: Date | null
  inspetorNome?: string | null
  brigadaNome?: string
  atividadesCount?: number
}

export function InqueritoCard({
  nuipc,
  nai,
  natureza,
  estado,
  faseProcessual,
  dataPrazo,
  inspetorNome,
  brigadaNome,
  atividadesCount = 0,
}: InqueritoCardProps) {
  const overdue = isOverdue(dataPrazo) && !estado.terminal

  return (
    <Link
      href={`/inqueritos/${nuipcToSlug(nuipc)}`}
      className="block p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
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
        </div>
        <div className="flex flex-col gap-1 items-end shrink-0">
          <EstadoBadge estado={estado} />
          <FaseBadge fase={faseProcessual} />
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
