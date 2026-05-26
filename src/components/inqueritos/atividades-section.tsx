'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lock, LockOpen, Check, Bell } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { AtividadeActions, type ConclusaoMode } from './atividade-actions'
import { formatDate, formatDateTimeWithSeconds, cn } from '@/lib/utils'

export interface AtividadeItem {
  id: string
  descricao: string
  dataRealizacao: string
  createdAt: string
  concluidaEm: string | null
  dataPrazo: string | null
  quantidade: number | null
  observacoes: string | null
  realizadaPor: { id: string; nome: string }
  conclusaoMode: ConclusaoMode
  canMutate: boolean
}

interface Props {
  atividades: AtividadeItem[]
  totalAtividades: number
  totalAtivPages: number
  ativPageNum: number
  inqSlug: string
  terminal: boolean
  /**
   * Quando true (INSPETOR_CHEFE a ver inquérito de outro membro da brigada),
   * as ações de edição ficam bloqueadas até o utilizador as desbloquear
   * explicitamente, evitando edições acidentais.
   */
  editLocked: boolean
}

export function AtividadesSection({
  atividades,
  totalAtividades,
  totalAtivPages,
  ativPageNum,
  inqSlug,
  terminal,
  editLocked,
}: Props) {
  const [editMode, setEditMode] = useState(!editLocked)

  const canAdd = !terminal && (!editLocked || editMode)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">
            Atividades ({totalAtividades})
          </CardTitle>
          <div className="flex items-center gap-2">
            {editLocked && (
              <Button
                size="sm"
                variant={editMode ? 'secondary' : 'outline'}
                className={cn(
                  'gap-1.5 text-xs',
                  !editMode && 'text-amber-600 border-amber-300 hover:bg-amber-50 dark:border-amber-700 dark:hover:bg-amber-950/30',
                )}
                onClick={() => setEditMode((v) => !v)}
              >
                {editMode
                  ? <><LockOpen className="h-3.5 w-3.5" />Bloquear edição</>
                  : <><Lock className="h-3.5 w-3.5" />Editar</>
                }
              </Button>
            )}
            {canAdd && (
              <Button size="sm" variant="outline">
                <Link href={`/inqueritos/${inqSlug}/atividade`} className="flex items-center gap-1.5 text-xs">
                  + Adicionar
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {totalAtividades === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Sem atividades registadas.
          </p>
        ) : (
          <>
            <div className="space-y-4">
              {atividades.map((atv, idx) => {
                const concluida = atv.concluidaEm != null
                const atvOverdue = !concluida && atv.dataPrazo && new Date(atv.dataPrazo) < new Date()
                const showActions = editMode && atv.canMutate

                return (
                  <div key={atv.id}>
                    {idx > 0 && <Separator className="mb-4" />}
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-medium">
                        {atv.realizadaPor.nome.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{atv.realizadaPor.nome}</span>
                          <span
                            className="text-xs text-muted-foreground"
                            title={`Realizada em ${formatDate(atv.dataRealizacao)}`}
                          >
                            {formatDateTimeWithSeconds(atv.createdAt)}
                          </span>
                          {showActions && (
                            <div className="ml-auto">
                              <AtividadeActions
                                atividadeId={atv.id}
                                descricao={atv.descricao}
                                inqueritoSlug={inqSlug}
                                concluidaEm={atv.concluidaEm}
                                conclusaoMode={atv.conclusaoMode}
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            {atv.descricao}
                          </span>
                          {atv.quantidade != null && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                              Qtd: {atv.quantidade}
                            </span>
                          )}
                          {concluida ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                              <Check className="h-3 w-3" />
                              Concluída em {formatDate(atv.concluidaEm!)}
                            </span>
                          ) : (
                            atv.dataPrazo && (
                              <span className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                                atvOverdue
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                  : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
                              )}>
                                <Bell className="h-3 w-3" />
                                Prazo: {formatDate(atv.dataPrazo)}
                              </span>
                            )
                          )}
                        </div>
                        {atv.observacoes && (
                          <p className="text-sm mt-1.5 text-muted-foreground whitespace-pre-wrap">
                            {atv.observacoes}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {totalAtivPages > 1 && (
              <div className="flex items-center justify-between text-sm mt-6">
                <span className="text-muted-foreground">
                  Página {ativPageNum} de {totalAtivPages}
                </span>
                <div className="flex gap-2">
                  {ativPageNum > 1 && (
                    <Link
                      href={`/inqueritos/${inqSlug}?ativPage=${ativPageNum - 1}`}
                      className="px-3 py-1.5 rounded-lg border hover:bg-accent transition-colors"
                    >
                      Anterior
                    </Link>
                  )}
                  {ativPageNum < totalAtivPages && (
                    <Link
                      href={`/inqueritos/${inqSlug}?ativPage=${ativPageNum + 1}`}
                      className="px-3 py-1.5 rounded-lg border hover:bg-accent transition-colors"
                    >
                      Próxima
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
