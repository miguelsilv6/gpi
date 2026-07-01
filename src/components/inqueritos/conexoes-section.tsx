import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ConexaoHit, ConexaoCampo } from '@/lib/conexoes'
import { Link2, ArrowUpRight } from 'lucide-react'

/**
 * Possíveis conexões pelo denunciante — deteção automática (fase 1, sem
 * entidade própria). Só se renderiza quando há coincidências; inquéritos já
 * formalmente relacionados não repetem aqui (vivem na secção de Relações).
 */

const CAMPO_LABEL: Record<ConexaoCampo, string> = {
  nif: 'NIF',
  contacto: 'Contacto',
  email: 'Email',
}

export function ConexoesSection({ conexoes }: { conexoes: ConexaoHit[] }) {
  if (conexoes.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
          <Link2 className="h-4 w-4" />
          Possíveis conexões
          <span className="font-normal text-muted-foreground">
            · mesmo denunciante ({conexoes.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {conexoes.map((c) => (
            <Link
              key={c.id}
              href={`/inqueritos/${c.slug}`}
              className="flex items-start justify-between gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm font-medium truncate flex items-center gap-1">
                  {c.nuipc}
                  <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {c.crimeNome}
                  {c.inspetorNome ? ` · ${c.inspetorNome}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {c.estadoNome}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  Coincide: {c.matches.map((m) => CAMPO_LABEL[m]).join(' + ')}
                </span>
              </div>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Deteção automática pelo NIF, contacto ou email do denunciante. Para
          formalizar, adicione a ligação na secção de inquéritos relacionados.
        </p>
      </CardContent>
    </Card>
  )
}
