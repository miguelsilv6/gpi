'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { PrazoUrgencyBadge } from '@/components/prazos/prazo-urgency-badge'
import {
  INTERCECAO_VALIDACAO_INTERVALO_DEFAULT,
  INTERCECAO_VALIDACAO_ALERTA_DEFAULT,
  numeroValidacaoRenovacao,
} from '@/lib/validations/intercecao'
import { formatDate, cn } from '@/lib/utils'
import { CalendarCheck, Loader2, Pencil, Gavel } from 'lucide-react'

export interface ValidacaoDTO {
  id: string
  numero: number
  data: string
  feitaEm: string | null
  observacoes: string | null
  feitaPor: { id: string; nome: string } | null
}

export interface PlanoDTO {
  dataPrimeira: string
  intervaloDias: number
  alertaDias: number
  validacoes: ValidacaoDTO[]
}

/** Linha intercetada, no mínimo necessário para assinalar as renovações. */
export interface LinhaRenovacao {
  codigo: string
  identificador: string
  alvoNome: string
  dataFim: string
}

interface Props {
  nuipcSlug: string
  plano: PlanoDTO | null
  linhas: LinhaRenovacao[]
  canEdit: boolean
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10)
}

/**
 * Calendário de validações quinzenais (art. 188.º CPP) — a folha "Registos" do
 * controlo em papel. As datas são geradas pelo servidor a partir do plano; aqui
 * marca-se o ✓ de feito e vê-se qual delas serve para preparar cada renovação.
 */
export function ValidacoesPanel({ nuipcSlug, plano, linhas, canEdit }: Props) {
  const router = useRouter()
  const base = `/api/inqueritos/${nuipcSlug}/intercecoes/validacoes`

  const [dialogAberto, setDialogAberto] = useState(false)
  const [dataPrimeira, setDataPrimeira] = useState('')
  const [intervaloDias, setIntervaloDias] = useState(String(INTERCECAO_VALIDACAO_INTERVALO_DEFAULT))
  const [alertaDias, setAlertaDias] = useState(String(INTERCECAO_VALIDACAO_ALERTA_DEFAULT))
  const [saving, setSaving] = useState(false)
  const [aGuardar, setAGuardar] = useState<string | null>(null)

  // Renovações por validação: a mesma regra do motor de alertas e do export.
  const renovacoesPorNumero = new Map<number, LinhaRenovacao[]>()
  if (plano) {
    for (const l of linhas) {
      const n = numeroValidacaoRenovacao(
        new Date(plano.dataPrimeira),
        plano.intervaloDias,
        new Date(l.dataFim),
      )
      if (n === null) continue
      const lista = renovacoesPorNumero.get(n)
      if (lista) lista.push(l)
      else renovacoesPorNumero.set(n, [l])
    }
  }

  function abrirDialog() {
    setDataPrimeira(plano ? toDateInput(plano.dataPrimeira) : '')
    setIntervaloDias(String(plano?.intervaloDias ?? INTERCECAO_VALIDACAO_INTERVALO_DEFAULT))
    setAlertaDias(String(plano?.alertaDias ?? INTERCECAO_VALIDACAO_ALERTA_DEFAULT))
    setDialogAberto(true)
  }

  async function guardarPlano() {
    setSaving(true)
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataPrimeira,
          intervaloDias: parseInt(intervaloDias, 10),
          alertaDias: parseInt(alertaDias, 10),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar o plano')
        return
      }
      toast.success(plano ? 'Plano de validações atualizado' : 'Plano de validações criado')
      setDialogAberto(false)
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setSaving(false)
    }
  }

  async function alternarFeita(v: ValidacaoDTO) {
    setAGuardar(v.id)
    try {
      const res = await fetch(`${base}/${v.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feita: v.feitaEm === null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setAGuardar(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarCheck className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-semibold">Validações / Renovações</span>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={abrirDialog}>
              <Pencil className="h-3 w-3" />
              {plano ? 'Editar plano' : 'Definir plano'}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {plano
            ? `De ${plano.intervaloDias} em ${plano.intervaloDias} dias a partir de ${formatDate(plano.dataPrimeira)} · aviso ${plano.alertaDias} dia${plano.alertaDias === 1 ? '' : 's'} antes.`
            : 'Apresentação periódica dos suportes ao Ministério Público (art. 188.º CPP).'}
        </p>
      </CardHeader>
      <CardContent>
        {!plano ? (
          <p className="text-sm text-muted-foreground">
            Sem plano definido.{' '}
            {canEdit
              ? 'Indique a data da 1.ª validação para o GPI gerar o calendário e avisar antes de cada uma.'
              : 'Ainda não foi definida a data da 1.ª validação.'}
          </p>
        ) : plano.validacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem validações geradas — acrescente uma linha intercetada para o calendário cobrir o
            período autorizado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">N.º</th>
                  <th className="py-1.5 pr-3 font-medium">Data</th>
                  <th className="py-1.5 pr-3 font-medium">Prazo</th>
                  <th className="py-1.5 pr-3 font-medium">Feito</th>
                  <th className="py-1.5 font-medium">Renovação a preparar</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {plano.validacoes.map((v) => {
                  const feita = v.feitaEm !== null
                  const renovacoes = renovacoesPorNumero.get(v.numero) ?? []
                  return (
                    <tr key={v.id} className={cn(feita && 'opacity-60')}>
                      <td className="py-2 pr-3 whitespace-nowrap">{v.numero}.ª</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDate(v.data)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {feita ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                            Feita
                          </span>
                        ) : (
                          <PrazoUrgencyBadge dataPrazo={v.data} alertaDias={plano.alertaDias} />
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {aGuardar === v.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Checkbox
                            checked={feita}
                            disabled={!canEdit}
                            onCheckedChange={() => canEdit && alternarFeita(v)}
                            aria-label={`Marcar a ${v.numero}.ª validação como feita`}
                          />
                        )}
                        {feita && v.feitaPor && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {v.feitaPor.nome}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-xs">
                        {renovacoes.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="inline-flex items-start gap-1.5 text-amber-900 dark:text-amber-200">
                            <Gavel className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                            <span>
                              {renovacoes
                                .map(
                                  (l) =>
                                    `${l.alvoNome} — ${l.codigo} (fim ${formatDate(l.dataFim)})`,
                                )
                                .join('; ')}
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogAberto} onOpenChange={(o) => !o && setDialogAberto(false)}>
        <DialogContent className="sm:max-w-md max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle>{plano ? 'Editar plano de validações' : 'Definir plano de validações'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1 min-h-0 overflow-y-auto -mx-4 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="planoData">Data da 1.ª validação *</Label>
              <Input
                id="planoData"
                type="date"
                value={dataPrimeira}
                onChange={(e) => setDataPrimeira(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="planoIntervalo">Intervalo (dias)</Label>
                <Input
                  id="planoIntervalo"
                  type="number"
                  min={1}
                  max={90}
                  value={intervaloDias}
                  onChange={(e) => setIntervaloDias(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="planoAlerta">Aviso (dias antes)</Label>
                <Input
                  id="planoAlerta"
                  type="number"
                  min={0}
                  max={365}
                  value={alertaDias}
                  onChange={(e) => setAlertaDias(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Com 14 dias, as validações caem sempre no mesmo dia da semana. O calendário é gerado
              até cobrir o fim da última interceção; alterar a data ou o intervalo move as
              validações ainda por fazer e reativa os avisos (as já marcadas como feitas mantêm-se).
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={guardarPlano} disabled={saving || !dataPrimeira}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
