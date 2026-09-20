'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { History } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { ESTADO_COR_BAR_CLASSES, ESTADO_COR_BAR_DEFAULT } from '@/lib/constants'
import { formatDuracaoDias, type EstadoDuracaoSegmento } from '@/lib/estado-duracao'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function corBarFor(cor: string | null): string {
  return cor ? (ESTADO_COR_BAR_CLASSES[cor] ?? ESTADO_COR_BAR_DEFAULT) : ESTADO_COR_BAR_DEFAULT
}

/**
 * Barra horizontal "onde esteve o inquérito": um segmento colorido por
 * estado (mesma cor do badge/Kanban), largura proporcional ao tempo passado
 * nele — raiz quadrada da duração para que estados curtos não desapareçam ao
 * lado de um estado muito longo. O estado atual pulsa suavemente.
 *
 * A barra em si é decorativa (`aria-hidden`): a legenda por baixo repete a
 * mesma informação em texto sempre visível, sem depender de hover/tap.
 */
export function EstadoDuracaoBar({ segmentos }: { segmentos: EstadoDuracaoSegmento[] }) {
  if (segmentos.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
          <History className="h-4 w-4" />
          Estado do inquérito
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="flex overflow-x-auto rounded-md" aria-hidden="true">
            {segmentos.map((seg) => {
              const peso = Math.sqrt(seg.duracaoMs / MS_PER_DAY)
              return (
                <Tooltip key={seg.key}>
                  <TooltipTrigger
                    tabIndex={-1}
                    className={
                      'h-8 min-w-10 border-r-2 border-background last:border-r-0 ' +
                      'first:rounded-l-md last:rounded-r-md cursor-default ' +
                      corBarFor(seg.cor) +
                      (seg.atual ? ' animate-pulse' : '')
                    }
                    style={{ flexGrow: peso, flexShrink: 1, flexBasis: 0 }}
                  />
                  <TooltipContent side="top" className="text-center">
                    <p className="font-semibold">
                      {seg.estadoNome}
                      {seg.atual ? ' (atual)' : ''}
                    </p>
                    <p className="opacity-80">
                      {formatDate(seg.inicio)} → {seg.fim ? formatDate(seg.fim) : 'agora'}
                    </p>
                    <p>{formatDuracaoDias(seg.dias)}</p>
                    {seg.porNome && <p className="opacity-80">por {seg.porNome}</p>}
                    {seg.motivo && <p className="opacity-80">{seg.motivo}</p>}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        </TooltipProvider>

        {/* Legenda sempre visível — mesma informação da tooltip, para quem
            não passa o rato/toca na barra (e para leitores de ecrã). */}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {segmentos.map((seg) => (
            <li key={seg.key} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${corBarFor(seg.cor)}`} aria-hidden />
              <span className="font-medium text-foreground">{seg.estadoNome}</span>
              <span>
                {formatDuracaoDias(seg.dias)}
                {seg.atual ? ' · atual' : ''}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
