'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Save, RotateCcw, Info, Mail } from 'lucide-react'
import { useBrand } from '@/components/brand-provider'
import {
  EMAIL_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_LIMITS,
  renderEmailHtml,
  renderEmailSubject,
  type EmailTemplate,
} from '@/lib/email-template'

/**
 * Tab "E-mail" em /configurações — personalização do template (global) dos
 * e-mails de notificação. Formulário estruturado + pré-visualização ao vivo
 * (usa a mesma função de render do servidor). Só ADMINISTRACAO.
 */

const SAMPLE = {
  titulo: 'Prazo a aproximar — 123/45.6TALSB',
  mensagem:
    'O prazo do inquérito 123/45.6TALSB vence em breve (31/12/2026).\n\nConsulte o inquérito para tratar do que falta antes do fim do prazo.',
}

export function EmailTemplateTab() {
  const brand = useBrand()
  const appName = brand.appName
  const [form, setForm] = useState<EmailTemplate>(EMAIL_TEMPLATE_DEFAULTS)
  const [original, setOriginal] = useState<EmailTemplate>(EMAIL_TEMPLATE_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/email-template')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        if (data.template) {
          setForm(data.template)
          setOriginal(data.template)
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('Falha a carregar o template de e-mail')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(original), [form, original])
  const corValida = /^#[0-9a-fA-F]{6}$/.test(form.corDestaque)

  function set<K extends keyof EmailTemplate>(key: K, value: EmailTemplate[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const previewHtml = useMemo(
    () => renderEmailHtml(form, { ...SAMPLE, appName }),
    [form, appName],
  )
  const previewSubject = useMemo(
    () => renderEmailSubject(form, { titulo: SAMPLE.titulo, appName }),
    [form, appName],
  )

  async function handleSave() {
    if (!corValida) {
      toast.error('Cor de destaque inválida — use o formato #rrggbb')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/email-template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setOriginal(form)
      toast.success('Template de e-mail guardado.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha a guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/40 p-3 flex gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Este template é aplicado a <strong>todos os e-mails de notificação</strong>. O título e a
          mensagem de cada notificação entram no corpo — aqui defines a apresentação (cabeçalho,
          cor, saudação, rodapé). O envio de e-mail tem ainda de estar ativo no{' '}
          <strong>servidor SMTP</strong> e no interruptor acima, e por tipo no separador{' '}
          <strong>Notificações</strong>. Podes usar{' '}
          <code>{'{appName}'}</code> na saudação, rodapé, aviso legal e prefixo.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Formulário */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> Aparência do e-mail
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.mostrarCabecalho}
                onCheckedChange={(v) => set('mostrarCabecalho', v === true)}
              />
              Mostrar cabeçalho com o nome da aplicação
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="etCor">Cor de destaque</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Escolher cor de destaque"
                  value={corValida ? form.corDestaque : '#1d4ed8'}
                  onChange={(e) => set('corDestaque', e.target.value)}
                  className="h-9 w-12 rounded border bg-background p-1"
                />
                <Input
                  id="etCor"
                  value={form.corDestaque}
                  onChange={(e) => set('corDestaque', e.target.value)}
                  placeholder="#1d4ed8"
                  maxLength={7}
                  className={cnHex(corValida)}
                />
              </div>
              {!corValida && (
                <p className="text-xs text-destructive">Use o formato #rrggbb (ex.: #1d4ed8).</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="etSaudacao">Saudação</Label>
              <Input
                id="etSaudacao"
                value={form.saudacao}
                onChange={(e) => set('saudacao', e.target.value)}
                maxLength={EMAIL_TEMPLATE_LIMITS.saudacao}
                placeholder="Olá,"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="etRodape">Rodapé / assinatura</Label>
              <Textarea
                id="etRodape"
                value={form.rodape}
                onChange={(e) => set('rodape', e.target.value)}
                maxLength={EMAIL_TEMPLATE_LIMITS.rodape}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="etAviso">Aviso legal (opcional)</Label>
              <Textarea
                id="etAviso"
                value={form.avisoLegal}
                onChange={(e) => set('avisoLegal', e.target.value)}
                maxLength={EMAIL_TEMPLATE_LIMITS.avisoLegal}
                rows={2}
                placeholder="Ex.: Esta mensagem pode conter informação confidencial…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="etPrefixo">Prefixo do assunto (opcional)</Label>
              <Input
                id="etPrefixo"
                value={form.assuntoPrefixo}
                onChange={(e) => set('assuntoPrefixo', e.target.value)}
                maxLength={EMAIL_TEMPLATE_LIMITS.assuntoPrefixo}
                placeholder="Ex.: [GPI]"
              />
              <p className="text-xs text-muted-foreground">
                Antecede o título no assunto. Vazio = apenas o título da notificação.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button onClick={handleSave} disabled={saving || !isDirty}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm(EMAIL_TEMPLATE_DEFAULTS)}
                disabled={saving}
              >
                <RotateCcw className="h-4 w-4" /> Repor predefinições
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Pré-visualização */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pré-visualização</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Assunto:</span> {previewSubject}
            </div>
            <iframe
              title="Pré-visualização do e-mail"
              srcDoc={previewHtml}
              className="w-full h-[460px] rounded-lg border bg-white"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function cnHex(valid: boolean): string {
  return valid ? 'font-mono' : 'font-mono border-destructive'
}
