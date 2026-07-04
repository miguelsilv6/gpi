import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PrazoUrgencyBadge } from '@/components/prazos/prazo-urgency-badge'
import { INTERCECAO_ALERTA1_DEFAULT } from '@/lib/validations/intercecao'
import { formatDate } from '@/lib/utils'
import { RadioTower, ArrowRight } from 'lucide-react'

interface Props {
  nuipcSlug: string
  resumo: {
    alvos: number
    linhasAtivas: number
    proximoFim: Date | null
    proximoAlertaDias: number | null
  }
}

/**
 * Card resumo das interceções no detalhe do inquérito. Server-renderable —
 * a gestão completa vive na subpágina /inqueritos/[nuipc]/intercecoes.
 */
export function IntercecoesSection({ nuipcSlug, resumo }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RadioTower className="h-4 w-4" />
          Interceções
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {resumo.alvos === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem alvos de interceção registados neste inquérito.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-2xl font-bold tabular-nums">{resumo.alvos}</span>{' '}
              <span className="text-muted-foreground">alvo{resumo.alvos !== 1 ? 's' : ''}</span>
            </div>
            <div>
              <span className="text-2xl font-bold tabular-nums">{resumo.linhasAtivas}</span>{' '}
              <span className="text-muted-foreground">
                linha{resumo.linhasAtivas !== 1 ? 's' : ''} ativa{resumo.linhasAtivas !== 1 ? 's' : ''}
              </span>
            </div>
            {resumo.proximoFim && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Próximo fim: {formatDate(resumo.proximoFim)}</span>
                <PrazoUrgencyBadge
                  dataPrazo={resumo.proximoFim}
                  alertaDias={resumo.proximoAlertaDias ?? INTERCECAO_ALERTA1_DEFAULT}
                />
              </div>
            )}
          </div>
        )}
        <Link
          href={`/inqueritos/${nuipcSlug}/intercecoes`}
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
        >
          Abrir controlo de interceções
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardContent>
    </Card>
  )
}
