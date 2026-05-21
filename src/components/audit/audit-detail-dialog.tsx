'use client'

import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { buttonVariants } from '@/components/ui/button'
import { cn, nuipcToSlug, formatDateTime } from '@/lib/utils'
import {
  User,
  Calendar,
  Globe,
  Monitor,
  Tag,
  ExternalLink,
  Hash,
} from 'lucide-react'
import { acaoLabel, acaoColor } from './audit-labels'
import { DiffRenderer } from './diff-renderer'

export interface AuditEntryFull {
  id: string
  acao: string
  entidade: string
  entidadeId: string
  utilizadorId: string
  utilizadorNome: string | null
  detalhes: unknown
  ip: string | null
  userAgent: string | null
  createdAt: string
  /** Enriquecido pela API quando entidade=Inquerito — permite link. */
  entidadeNuipc?: string | null
  /** Enriquecido pela API quando entidade=Utilizador — permite link. */
  entidadeEmail?: string | null
}

/**
 * Dialog de detalhes para uma entry de audit log. Renderiza:
 *   - Header: label da acao (cor por categoria) + data
 *   - Meta: utilizador, IP, user-agent (truncado)
 *   - Entidade: tipo + ID + link directo quando aplicável
 *   - Detalhes: DiffRenderer adaptativo (diff / policy changes / KV / JSON)
 *
 * Usado na página global /auditlog ao clicar numa linha/card.
 */
export function AuditDetailDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: AuditEntryFull | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  if (!entry) return null

  const isBulkMarker =
    entry.entidadeId.startsWith('__bulk') || entry.entidadeId === '__no-id__'

  // Resolução do link "Ver entidade":
  //   - Inquerito → /inqueritos/[nuipcSlug] (precisa de NUIPC enriquecido)
  //   - Utilizador → /utilizadores/[id]
  //   - outros → sem link (entidadeId pode não ser routable)
  const entityHref = (() => {
    if (isBulkMarker) return null
    if (entry.entidade === 'Inquerito' && entry.entidadeNuipc) {
      return `/inqueritos/${nuipcToSlug(entry.entidadeNuipc)}`
    }
    if (entry.entidade === 'Utilizador') {
      return `/utilizadores/${entry.entidadeId}`
    }
    return null
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <DialogTitle className="text-base flex items-center gap-2">
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium',
                  acaoColor(entry.acao),
                )}
              >
                {entry.acao}
              </span>
              {acaoLabel(entry.acao)}
            </DialogTitle>
          </div>
          <DialogDescription className="flex items-center gap-1 text-xs">
            <Calendar className="h-3 w-3" />
            {formatDateTime(new Date(entry.createdAt))}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Meta — utilizador, IP, UA */}
          <section className="rounded-md border bg-muted/30 p-3 space-y-2">
            <MetaRow icon={<User className="h-3.5 w-3.5" />} label="Utilizador">
              <span className="font-medium">{entry.utilizadorNome ?? '—'}</span>
              <span className="text-muted-foreground ml-2 font-mono text-xs">
                {entry.utilizadorId}
              </span>
            </MetaRow>
            <MetaRow icon={<Globe className="h-3.5 w-3.5" />} label="IP">
              {entry.ip ? (
                <span className="font-mono text-xs">{entry.ip}</span>
              ) : (
                <span className="text-muted-foreground italic text-xs">—</span>
              )}
            </MetaRow>
            <MetaRow icon={<Monitor className="h-3.5 w-3.5" />} label="User-agent">
              {entry.userAgent ? (
                <span className="text-xs break-all">{entry.userAgent}</span>
              ) : (
                <span className="text-muted-foreground italic text-xs">—</span>
              )}
            </MetaRow>
          </section>

          {/* Entidade */}
          <section className="rounded-md border p-3 space-y-2">
            <MetaRow icon={<Tag className="h-3.5 w-3.5" />} label="Entidade">
              <span className="font-medium">{entry.entidade}</span>
              {entry.entidadeNuipc && (
                <span className="text-muted-foreground ml-2 font-mono">
                  {entry.entidadeNuipc}
                </span>
              )}
              {entry.entidadeEmail && (
                <span className="text-muted-foreground ml-2">
                  {entry.entidadeEmail}
                </span>
              )}
            </MetaRow>
            <MetaRow icon={<Hash className="h-3.5 w-3.5" />} label="ID">
              <span className="font-mono text-xs break-all">
                {isBulkMarker ? (
                  <em className="text-muted-foreground">{entry.entidadeId}</em>
                ) : (
                  entry.entidadeId
                )}
              </span>
            </MetaRow>
            {entityHref && (
              <div className="pt-1">
                <Link
                  href={entityHref}
                  className={cn(buttonVariants({ size: 'xs', variant: 'outline' }))}
                  onClick={() => onOpenChange(false)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Ver entidade
                </Link>
              </div>
            )}
          </section>

          {/* Detalhes */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Detalhes
            </h3>
            <div className="rounded-md bg-muted/40 p-3">
              <DiffRenderer detalhes={entry.detalhes} />
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground min-w-[110px] text-xs pt-0.5">
        {icon}
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
