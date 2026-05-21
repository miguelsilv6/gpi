'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Save, Bell, Mail, Info } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import type { Role } from '@/generated/prisma/enums'

/**
 * Tab "Notificações" em /configurações.
 *
 * Para cada `TipoNotificacao`, o admin controla:
 *   - In-app (cria `Notificacao` em DB)
 *   - Email (chama sendMail; respeita também DISABLE_EMAIL global)
 *   - Roles CC (utilizadores destes roles recebem em adição ao destinatário
 *     natural — inspetor do inquérito, criador da atividade, etc.)
 *
 * Padrão de UX: mudanças são staged em local state. O botão "Guardar
 * alterações" só fica activo quando há diff vs servidor.
 */

// Roles disponíveis como CC. INSPETOR é omitido — não há caso de uso natural
// para "todos os inspetores em CC" (gera ruído massivo).
const CC_ROLE_OPTIONS: Role[] = ['INSPETOR_CHEFE', 'COORDENADOR', 'ESTATISTICA', 'ADMINISTRACAO']

interface PolicyRow {
  tipo: string
  label: string
  descricao: string
  hasNaturalRecipient: boolean
  inAppEnabled: boolean
  emailEnabled: boolean
  ccRoles: Role[]
}

export function NotificacoesTab() {
  const [policies, setPolicies] = useState<PolicyRow[]>([])
  const [original, setOriginal] = useState<PolicyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/notification-policies')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setPolicies(data.policies ?? [])
        setOriginal(data.policies ?? [])
      })
      .catch((err) => {
        console.error('Falha a carregar policies:', err)
        if (!cancelled) toast.error('Falha a carregar configurações de notificação')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // True se algum campo de qualquer policy mudou face ao carregamento inicial.
  const isDirty = policies.some((p, i) => {
    const orig = original[i]
    if (!orig) return true
    return (
      p.inAppEnabled !== orig.inAppEnabled ||
      p.emailEnabled !== orig.emailEnabled ||
      p.ccRoles.length !== orig.ccRoles.length ||
      p.ccRoles.some((r) => !orig.ccRoles.includes(r))
    )
  })

  function updatePolicy(tipo: string, patch: Partial<PolicyRow>) {
    setPolicies((prev) => prev.map((p) => (p.tipo === tipo ? { ...p, ...patch } : p)))
  }

  function toggleCcRole(tipo: string, role: Role) {
    setPolicies((prev) =>
      prev.map((p) => {
        if (p.tipo !== tipo) return p
        const has = p.ccRoles.includes(role)
        return {
          ...p,
          ccRoles: has ? p.ccRoles.filter((r) => r !== role) : [...p.ccRoles, role],
        }
      }),
    )
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/notification-policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policies: policies.map((p) => ({
            tipo: p.tipo,
            inAppEnabled: p.inAppEnabled,
            emailEnabled: p.emailEnabled,
            ccRoles: p.ccRoles,
          })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setOriginal(policies)
      toast.success(
        data.changed > 0
          ? `Configurações guardadas (${data.changed} tipo${data.changed === 1 ? '' : 's'} alterado${data.changed === 1 ? '' : 's'}).`
          : 'Sem alterações para guardar.',
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha a guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
        A carregar configurações…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Configurações de Notificações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Para cada tipo, escolha se a notificação é enviada por in-app e/ou email,
            e quais <strong>roles</strong> recebem cópia em adição ao destinatário natural.
          </p>
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900 flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>Destinatário natural</strong> = quem o contexto define
              automaticamente (inspetor do inquérito, criador da atividade, chefes
              das brigadas envolvidas). Continua <em>sempre</em> a ser notificado.
              Os roles abaixo recebem em adição como CC.
              {' '}
              <span className="text-blue-700">
                Excepção: <code>BACKUP_FALHOU</code> não tem destinatário natural
                — só os roles CC recebem.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[280px]">Tipo</TableHead>
                <TableHead className="w-24 text-center">
                  <span className="inline-flex items-center gap-1">
                    <Bell className="h-3.5 w-3.5" />
                    In-app
                  </span>
                </TableHead>
                <TableHead className="w-24 text-center">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </span>
                </TableHead>
                <TableHead>Roles CC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((p) => (
                <TableRow key={p.tipo}>
                  <TableCell className="align-top py-3">
                    <div className="font-medium text-sm">{p.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {p.descricao}
                    </div>
                    {!p.hasNaturalRecipient && (
                      <div className="text-xs text-amber-700 mt-1 font-medium">
                        ⚠ Sem destinatário natural — depende dos CC.
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-center pt-4">
                    <Checkbox
                      checked={p.inAppEnabled}
                      onCheckedChange={(v) =>
                        updatePolicy(p.tipo, { inAppEnabled: v === true })
                      }
                    />
                  </TableCell>
                  <TableCell className="align-top text-center pt-4">
                    <Checkbox
                      checked={p.emailEnabled}
                      onCheckedChange={(v) =>
                        updatePolicy(p.tipo, { emailEnabled: v === true })
                      }
                    />
                  </TableCell>
                  <TableCell className="align-top py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {CC_ROLE_OPTIONS.map((role) => {
                        const checked = p.ccRoles.includes(role)
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => toggleCcRole(p.tipo, role)}
                            className={cn(
                              'rounded-full border px-3 py-0.5 text-xs transition-colors',
                              checked
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-background hover:bg-muted',
                            )}
                          >
                            {ROLE_LABELS[role]}
                          </button>
                        )
                      })}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={handleSave} disabled={!isDirty || saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              A guardar…
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar alterações
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
