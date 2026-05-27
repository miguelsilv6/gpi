import Link from 'next/link'
import { EstadoBadge } from '@/components/inqueritos/estado-badge'
import { PrazoUrgencyBadge } from './prazo-urgency-badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate, nuipcToSlug } from '@/lib/utils'
import { Check } from 'lucide-react'
import type { PrazoItem } from './types'

interface Props {
  items: PrazoItem[]
  showInspetor: boolean
  showBrigada: boolean
  alertaDias: number
  emptyMessage?: string
}

export function PrazosList({
  items,
  showInspetor,
  showBrigada,
  alertaDias,
  emptyMessage = 'Sem prazos para mostrar.',
}: Props) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Inquérito</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Atividade</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Prazo</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Urgência</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              {showInspetor && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Inspetor</th>
              )}
              {showBrigada && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Brigada</th>
              )}
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Alertas</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/inqueritos/${nuipcToSlug(p.inquerito.nuipc)}`}
                    className="font-mono font-medium hover:text-blue-600 hover:underline"
                  >
                    {p.inquerito.nuipc}
                  </Link>
                </td>
                <td className="px-4 py-3 max-w-[260px]">
                  <p className="line-clamp-2">{p.descricao}</p>
                  {p.quantidade != null && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Qtd: {p.quantidade}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(p.dataPrazo)}
                </td>
                <td className="px-4 py-3">
                  <PrazoUrgencyBadge
                    dataPrazo={p.dataPrazo}
                    alertaDias={p.alertaDias1 ?? alertaDias}
                  />
                </td>
                <td className="px-4 py-3">
                  <EstadoBadge estado={p.inquerito.estado} />
                </td>
                {showInspetor && (
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.realizadaPor.nome}
                  </td>
                )}
                {showBrigada && (
                  <td className="px-4 py-3 text-muted-foreground">
                    {p.inquerito.brigada?.nome ?? '—'}
                  </td>
                )}
                <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                  <AlertasIndicator
                    dias1={p.alertaDias1}
                    dias2={p.alertaDias2}
                    sent1={p.alerta1Enviado}
                    sent2={p.alerta2Enviado}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {items.map((p) => (
          <Link
            key={p.id}
            href={`/inqueritos/${nuipcToSlug(p.inquerito.nuipc)}`}
            className="block p-4 rounded-xl border bg-card hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold">{p.inquerito.nuipc}</p>
                <p className="text-sm mt-1 line-clamp-2">{p.descricao}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Prazo: {formatDate(p.dataPrazo)}
                </p>
                {showInspetor && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Inspetor: <span className="text-foreground">{p.realizadaPor.nome}</span>
                  </p>
                )}
                {showBrigada && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Brigada: <span className="text-foreground">{p.inquerito.brigada?.nome ?? '—'}</span>
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <PrazoUrgencyBadge
                  dataPrazo={p.dataPrazo}
                  alertaDias={p.alertaDias1 ?? alertaDias}
                />
                <EstadoBadge estado={p.inquerito.estado} />
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              <AlertasIndicator
                dias1={p.alertaDias1}
                dias2={p.alertaDias2}
                sent1={p.alerta1Enviado}
                sent2={p.alerta2Enviado}
              />
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}

function AlertasIndicator({
  dias1,
  dias2,
  sent1,
  sent2,
}: {
  dias1: number | null
  dias2: number | null
  sent1: boolean
  sent2: boolean
}) {
  if (dias1 == null && dias2 == null) {
    return <span className="text-muted-foreground/50">—</span>
  }
  return (
    <span className="inline-flex items-center gap-2">
      {dias1 != null && (
        <span
          className="inline-flex items-center gap-0.5"
          title={`Aviso aos ${dias1} dias`}
        >
          {sent1 && <Check className="h-3 w-3 text-green-600" />}
          {dias1}d
        </span>
      )}
      {dias2 != null && (
        <span
          className="inline-flex items-center gap-0.5"
          title={`2.º aviso aos ${dias2} dias`}
        >
          {sent2 && <Check className="h-3 w-3 text-green-600" />}
          {dias2}d
        </span>
      )}
    </span>
  )
}
