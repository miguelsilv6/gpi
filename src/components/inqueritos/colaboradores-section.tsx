'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HelpButton, HelpSection } from '@/components/ui/help-button'
import { Users, Plus, Trash2, Loader2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'

export interface ColaboradorItem {
  id: string
  motivo: string | null
  expiraEm: string | null
  createdAt: string
  colaborador: { id: string; nome: string; email: string }
  concedidoPor: { id: string; nome: string } | null
}

interface InspetorOption {
  id: string
  nome: string
  email: string
}

interface Props {
  nuipcSlug: string
  colaboradores: ColaboradorItem[]
  inspetoresDisponiveis: InspetorOption[]
  podeGerir: boolean
}

/** Uma autorização está expirada quando tem prazo e este já passou. */
function expirada(c: ColaboradorItem): boolean {
  return c.expiraEm != null && new Date(c.expiraEm).getTime() <= Date.now()
}

export function ColaboradoresSection({ nuipcSlug, colaboradores, inspetoresDisponiveis, podeGerir }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [colaboradorId, setColaboradorId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [expiraEm, setExpiraEm] = useState('')
  const [saving, setSaving] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  // Não mostrar a secção quando não há nada a mostrar nem a gerir.
  if (!podeGerir && colaboradores.length === 0) return null

  // Inspetores que ainda não estão autorizados (para o seletor).
  const jaAutorizados = new Set(colaboradores.map((c) => c.colaborador.id))
  const opcoes = inspetoresDisponiveis.filter((i) => !jaAutorizados.has(i.id))

  // Data de hoje (local) em YYYY-MM-DD, para impedir escolher um prazo passado
  // no seletor. O servidor valida na mesma; isto é só uma ajuda de UX.
  const d = new Date()
  const hojeISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  function resetForm() {
    setColaboradorId('')
    setMotivo('')
    setExpiraEm('')
  }

  async function handleGrant() {
    if (!colaboradorId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/inqueritos/${nuipcSlug}/colaboradores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colaboradorId, motivo: motivo.trim() || undefined, expiraEm: expiraEm || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao autorizar')
        return
      }
      toast.success('Colaborador autorizado')
      setOpen(false)
      resetForm()
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(id: string, nome: string) {
    if (!confirm(`Revogar a autorização de ${nome}? Deixa de poder trabalhar neste inquérito.`)) return
    setRevoking(id)
    try {
      const res = await fetch(`/api/inqueritos/${nuipcSlug}/colaboradores/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao revogar')
        return
      }
      toast.success('Autorização revogada')
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setRevoking(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Colaboradores autorizados
          </CardTitle>
          <div className="flex items-center gap-1">
            <HelpButton title="Ajuda — Colaboradores" className="shrink-0">
              <HelpSection title="O que é">
                <p>
                  Permite autorizar outro inspetor a <strong>trabalhar</strong> neste inquérito
                  (registar atividades, notas, documentos, controlos e interceções) mesmo não lhe
                  estando distribuído.
                </p>
              </HelpSection>
              <HelpSection title="Limites">
                <p>
                  O colaborador <strong>não</strong> altera o estado, o prazo nem o titular, não
                  apaga o inquérito e não pode autorizar terceiros. A autorização é revogável a
                  qualquer momento e pode ter data de expiração.
                </p>
              </HelpSection>
            </HelpButton>
            {podeGerir && (
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => { resetForm(); setOpen(true) }}>
                <Plus className="h-3.5 w-3.5" /> Autorizar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {colaboradores.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem colaboradores autorizados.</p>
        ) : (
          <ul className="divide-y">
            {colaboradores.map((c) => {
              const exp = expirada(c)
              return (
                <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{c.colaborador.nome}</span>
                      {exp && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 px-2 py-0.5 text-[11px]">
                          Expirada
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.colaborador.email}</p>
                    {c.motivo && <p className="text-xs text-muted-foreground mt-0.5">{c.motivo}</p>}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {c.expiraEm ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {exp ? 'Expirou' : 'Expira'} a {formatDate(c.expiraEm)}
                        </span>
                      ) : (
                        'Sem prazo'
                      )}
                      {c.concedidoPor ? ` · por ${c.concedidoPor.nome}` : ''}
                    </p>
                  </div>
                  {podeGerir && (
                    <button
                      onClick={() => handleRevoke(c.id, c.colaborador.nome)}
                      disabled={revoking === c.id}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                      title="Revogar autorização"
                      aria-label={`Revogar autorização de ${c.colaborador.nome}`}
                    >
                      {revoking === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      {/* Dialog de autorização */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Autorizar colaborador</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Inspetor *</Label>
              <Select value={colaboradorId} onValueChange={(v) => v && setColaboradorId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Escolher inspetor…">
                    {(v: string | null) => {
                      const found = opcoes.find((o) => o.id === v)
                      return found ? found.nome : 'Escolher inspetor…'
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {opcoes.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">Sem inspetores disponíveis.</div>
                  ) : (
                    opcoes.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nome} <span className="text-muted-foreground">· {o.email}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="colabMotivo">Motivo (opcional)</Label>
              <Input
                id="colabMotivo"
                placeholder="Ex.: apoio na análise de escutas"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="colabExpira">Expira em (opcional)</Label>
              <Input
                id="colabExpira"
                type="date"
                value={expiraEm}
                min={hojeISO}
                onChange={(e) => setExpiraEm(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Sem data = vale até ser revogada.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleGrant} disabled={saving || !colaboradorId}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Autorizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
