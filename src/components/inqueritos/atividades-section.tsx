'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lock, LockOpen, Check, Bell, ClipboardCheck, Loader2, RotateCcw } from 'lucide-react'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { AtividadeActions, type ConclusaoMode } from './atividade-actions'
import { formatDate, formatDateTimeWithSeconds, cn } from '@/lib/utils'
import { ordinalControlo } from '@/lib/controlos'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export interface AtividadeControlo {
  id: string
  periodoDias: number | null
  concluidoEm: string | null
  nextRealizacao: {
    id: string
    numero: number
    dataEsperada: string
  } | null
}

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
  /** Can mark the activity as concluded (devolução/exame/prazo). Wider than
   *  canMutate — inspectors can conclude activities they didn't create. */
  canConclude: boolean
  isOverdue: boolean
  controlo: AtividadeControlo | null
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

function ConfirmarControloButton({
  controloId,
  realizacao,
}: {
  controloId: string
  realizacao: { id: string; numero: number; dataEsperada: string }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [obs, setObs] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setLoading(true)
    try {
      const res = await fetch(`/api/controlos/${controloId}/realizacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realizacaoId: realizacao.id, observacoes: obs.trim() || null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao confirmar controlo')
        return
      }
      toast.success(`${ordinalControlo(realizacao.numero)} confirmado`)
      setObs('')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede ao confirmar controlo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800 transition-colors"
      >
        <ClipboardCheck className="h-3 w-3" />
        {ordinalControlo(realizacao.numero)}
      </button>
      <Dialog open={open} onOpenChange={(val) => { if (!loading) setOpen(val) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar {ordinalControlo(realizacao.numero)}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Previsto para <strong>{formatDate(realizacao.dataEsperada)}</strong>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="obs-ctrl-atv">Observações (opcional)</Label>
            <Textarea
              id="obs-ctrl-atv"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Observações sobre a realização..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={submit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
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
            <HelpButton title="Ajuda — Atividades">
              <HelpSection title="O que é uma atividade">
                <p>Uma atividade representa uma diligência ou tarefa associada ao inquérito (ex.: inquirição, busca, perícia). Pode ter um prazo, uma quantidade e observações.</p>
              </HelpSection>
              <HelpSection title="Concluir uma atividade">
                <p>Clique no botão de conclusão e escolha o modo:</p>
                <ul className="list-disc pl-4 space-y-0.5 mt-1">
                  <li><strong>Devolução</strong> — a atividade foi devolvida ao MP/tribunal.</li>
                  <li><strong>Exame</strong> — a atividade resultou numa diligência de exame.</li>
                  <li><strong>Prazo</strong> — o prazo foi cumprido/entregue.</li>
                </ul>
              </HelpSection>
              <HelpSection title="Controlos periódicos">
                <p>Uma atividade pode ter um controlo periódico associado (ex.: controlo mensal). Quando a data de realização se aproxima, o sistema apresenta um alerta. Clique em <strong>Confirmar</strong> para registar cada realização.</p>
              </HelpSection>
              <HelpSection title="Alertas">
                <p>O ícone <Bell className="inline h-3.5 w-3.5 mx-0.5 align-text-bottom" /> indica que a atividade tem um alerta de prazo configurado. O ícone <ClipboardCheck className="inline h-3.5 w-3.5 mx-0.5 align-text-bottom" /> aparece nos controlos.</p>
              </HelpSection>
              <HelpSection title="Edição bloqueada">
                <p>Quando visualiza um inquérito de outro inspetor, a edição fica bloqueada por defeito para evitar alterações acidentais. Clique em <strong>Editar</strong> para desbloquear.</p>
              </HelpSection>
            </HelpButton>
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
                const atvOverdue = atv.isOverdue
                const showEditDelete = editMode && atv.canMutate
                const showConclude = editMode && atv.canConclude
                const showActions = showEditDelete || showConclude

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
                                canEdit={showEditDelete}
                                canConclude={showConclude}
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
                        {atv.controlo && !atv.controlo.concluidoEm && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {atv.controlo.nextRealizacao ? (
                              <ConfirmarControloButton
                                controloId={atv.controlo.id}
                                realizacao={atv.controlo.nextRealizacao}
                              />
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800">
                                <Check className="h-3 w-3" />
                                Controlos em dia
                              </span>
                            )}
                            {atv.controlo.periodoDias && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <RotateCcw className="h-3 w-3" />
                                A cada {atv.controlo.periodoDias} dias
                              </span>
                            )}
                          </div>
                        )}
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
