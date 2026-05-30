'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, RotateCcw, Upload, Trash2, Image as ImageIcon, Palette } from 'lucide-react'
import { BRAND_DEFAULTS, type Brand } from '@/lib/brand-defaults'

type LogoVariant = 'light' | 'dark'

interface TextForm {
  appName: string
  appShortName: string
  appDescription: string
  manifestDescription: string
  pdfFooterText: string
  appAuthor: string
}

function brandAssetUrl(filename: string | null, brandUpdatedAt: string | Date | null): string | null {
  if (!filename) return null
  const v = brandUpdatedAt ? new Date(brandUpdatedAt).getTime() : 0
  return `/branding/${encodeURIComponent(filename)}?v=${v}`
}

export function AparenciaTab() {
  const router = useRouter()
  const [brand, setBrand] = useState<Brand | null>(null)
  const [form, setForm] = useState<TextForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState<LogoVariant | null>(null)
  const [uploadingFavicon, setUploadingFavicon] = useState(false)
  const [removingLogo, setRemovingLogo] = useState<LogoVariant | null>(null)
  const [removingFavicon, setRemovingFavicon] = useState(false)

  const logoLightInput = useRef<HTMLInputElement>(null)
  const logoDarkInput = useRef<HTMLInputElement>(null)
  const faviconInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/branding')
      if (!res.ok) throw new Error('load failed')
      const b: Brand = await res.json()
      setBrand(b)
      setForm({
        appName: b.appName,
        appShortName: b.appShortName,
        appDescription: b.appDescription,
        manifestDescription: b.manifestDescription,
        pdfFooterText: b.pdfFooterText,
        appAuthor: b.appAuthor,
      })
    } catch {
      toast.error('Erro ao carregar personalização')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleSaveText() {
    if (!form) return
    setSaving(true)
    try {
      // Convert empty string → null (reset to default)
      const payload: Record<string, string | null> = {}
      for (const k of Object.keys(form) as (keyof TextForm)[]) {
        const v = form[k].trim()
        payload[k] = v === '' ? null : v
      }
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      toast.success('Textos guardados')
      await load()
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  function resetField(k: keyof TextForm) {
    if (!form) return
    setForm({ ...form, [k]: BRAND_DEFAULTS[k] })
  }

  async function handleUploadLogo(variant: LogoVariant, file: File) {
    setUploadingLogo(variant)
    try {
      const fd = new FormData()
      fd.set('file', file)
      const res = await fetch(`/api/branding/logo?variant=${variant}`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro no upload')
        return
      }
      toast.success(`Logo (${variant === 'light' ? 'claro' : 'escuro'}) carregado`)
      await load()
      router.refresh()
    } finally {
      setUploadingLogo(null)
    }
  }

  async function handleRemoveLogo(variant: LogoVariant) {
    setRemovingLogo(variant)
    try {
      const res = await fetch(`/api/branding/logo?variant=${variant}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro a remover')
        return
      }
      toast.success('Logo removido')
      await load()
      router.refresh()
    } finally {
      setRemovingLogo(null)
    }
  }

  async function handleUploadFavicon(file: File) {
    setUploadingFavicon(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      const res = await fetch('/api/branding/favicon', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro no upload')
        return
      }
      toast.success('Favicon carregado')
      await load()
      router.refresh()
    } finally {
      setUploadingFavicon(false)
    }
  }

  async function handleRemoveFavicon() {
    setRemovingFavicon(true)
    try {
      const res = await fetch('/api/branding/favicon', { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro a remover')
        return
      }
      toast.success('Favicon removido')
      await load()
      router.refresh()
    } finally {
      setRemovingFavicon(false)
    }
  }

  if (loading || !brand || !form) {
    return <div className="text-sm text-muted-foreground py-4">A carregar...</div>
  }

  const lightLogoUrl = brandAssetUrl(brand.logoLightFilename, brand.brandUpdatedAt)
  const darkLogoUrl = brandAssetUrl(brand.logoDarkFilename, brand.brandUpdatedAt)
  const faviconUrl = brandAssetUrl(brand.faviconFilename, brand.brandUpdatedAt)

  return (
    <div className="space-y-4">
      {/* Pré-visualização */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Pré-visualização
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 px-4 py-5 border rounded-lg bg-background max-w-sm">
            {lightLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lightLogoUrl} alt="" className="h-8 w-8 rounded-md object-contain" />
            ) : (
              <div className="bg-blue-600 p-1.5 rounded-md text-white font-bold w-8 h-8 flex items-center justify-center text-xs">
                {form.appShortName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-bold text-sm leading-none">{form.appShortName}</p>
              <p className="text-xs text-muted-foreground leading-none mt-0.5">{form.appDescription}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Esta é a representação aproximada do cabeçalho da sidebar com as alterações actuais (ainda não gravadas).
          </p>
        </CardContent>
      </Card>

      {/* Textos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Identidade textual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TextField
            label="Nome"
            id="appName"
            value={form.appName}
            onChange={(v) => setForm({ ...form, appName: v })}
            onReset={() => resetField('appName')}
            isDefault={form.appName === BRAND_DEFAULTS.appName}
            placeholder={BRAND_DEFAULTS.appName}
            maxLength={40}
            hint="Nome completo da app (aparece em metadata, login, emails)."
          />
          <TextField
            label="Nome curto"
            id="appShortName"
            value={form.appShortName}
            onChange={(v) => setForm({ ...form, appShortName: v })}
            onReset={() => resetField('appShortName')}
            isDefault={form.appShortName === BRAND_DEFAULTS.appShortName}
            placeholder={BRAND_DEFAULTS.appShortName}
            maxLength={10}
            hint="Versão curta para sidebar e manifest PWA (máx 10 caracteres)."
          />
          <TextField
            label="Descrição"
            id="appDescription"
            value={form.appDescription}
            onChange={(v) => setForm({ ...form, appDescription: v })}
            onReset={() => resetField('appDescription')}
            isDefault={form.appDescription === BRAND_DEFAULTS.appDescription}
            placeholder={BRAND_DEFAULTS.appDescription}
            maxLength={120}
            hint="Tagline curta que aparece no login e na sidebar."
          />
          <TextField
            label="Descrição manifest (PWA)"
            id="manifestDescription"
            value={form.manifestDescription}
            onChange={(v) => setForm({ ...form, manifestDescription: v })}
            onReset={() => resetField('manifestDescription')}
            isDefault={form.manifestDescription === BRAND_DEFAULTS.manifestDescription}
            placeholder={BRAND_DEFAULTS.manifestDescription}
            maxLength={200}
            textarea
            hint="Descrição longa usada no manifest PWA quando o utilizador instala a app."
          />
          <TextField
            label="Rodapé de PDFs"
            id="pdfFooterText"
            value={form.pdfFooterText}
            onChange={(v) => setForm({ ...form, pdfFooterText: v })}
            onReset={() => resetField('pdfFooterText')}
            isDefault={form.pdfFooterText === BRAND_DEFAULTS.pdfFooterText}
            placeholder={BRAND_DEFAULTS.pdfFooterText}
            maxLength={120}
            hint="Texto que aparece no rodapé dos relatórios PDF gerados."
          />
          <TextField
            label="Autor / Entidade"
            id="appAuthor"
            value={form.appAuthor}
            onChange={(v) => setForm({ ...form, appAuthor: v })}
            onReset={() => setForm({ ...form, appAuthor: BRAND_DEFAULTS.appAuthor })}
            isDefault={form.appAuthor === BRAND_DEFAULTS.appAuthor}
            placeholder="ex: Polícia Judiciária — Unidade Nacional de Combate ao Tráfico"
            maxLength={120}
            hint="Aparece na sidebar junto à versão. Deixar em branco para não mostrar."
          />

          <Button onClick={handleSaveText} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Guardar textos
          </Button>
        </CardContent>
      </Card>

      {/* Logo claro */}
      <LogoCard
        title="Logo (modo claro)"
        description="Mostrado em fundos claros — sidebar, login, manifest PWA. Recomenda-se SVG ou PNG transparente."
        currentUrl={lightLogoUrl}
        defaultUrl="/branding-defaults/logo-light.svg"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        inputRef={logoLightInput}
        uploading={uploadingLogo === 'light'}
        removing={removingLogo === 'light'}
        onUpload={(f) => handleUploadLogo('light', f)}
        onRemove={() => handleRemoveLogo('light')}
        hasCustom={!!brand.logoLightFilename}
      />

      {/* Logo escuro */}
      <LogoCard
        title="Logo (modo escuro)"
        description="Mostrado quando o tema escuro está ativo. Se não definido, usa-se o logo claro."
        currentUrl={darkLogoUrl}
        defaultUrl="/branding-defaults/logo-dark.svg"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        inputRef={logoDarkInput}
        uploading={uploadingLogo === 'dark'}
        removing={removingLogo === 'dark'}
        onUpload={(f) => handleUploadLogo('dark', f)}
        onRemove={() => handleRemoveLogo('dark')}
        hasCustom={!!brand.logoDarkFilename}
      />

      {/* Favicon */}
      <LogoCard
        title="Favicon"
        description="Ícone do separador do browser. Idealmente 32×32 PNG ou .ico. Aceita também SVG."
        currentUrl={faviconUrl}
        defaultUrl="/branding-defaults/favicon.ico"
        accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon,image/vnd.microsoft.icon"
        inputRef={faviconInput}
        uploading={uploadingFavicon}
        removing={removingFavicon}
        onUpload={handleUploadFavicon}
        onRemove={handleRemoveFavicon}
        hasCustom={!!brand.faviconFilename}
        previewSize={32}
      />
    </div>
  )
}

function TextField({
  label,
  id,
  value,
  onChange,
  onReset,
  isDefault,
  placeholder,
  maxLength,
  hint,
  textarea,
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  onReset: () => void
  isDefault: boolean
  placeholder: string
  maxLength: number
  hint?: string
  textarea?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {!isDefault && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            Repor default
          </button>
        )}
      </div>
      {textarea ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={2}
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        <p className="text-xs text-muted-foreground tabular-nums">
          {value.length}/{maxLength}
        </p>
      </div>
    </div>
  )
}

function LogoCard({
  title,
  description,
  currentUrl,
  defaultUrl,
  accept,
  inputRef,
  uploading,
  removing,
  onUpload,
  onRemove,
  hasCustom,
  previewSize = 64,
}: {
  title: string
  description: string
  currentUrl: string | null
  defaultUrl: string
  accept: string
  inputRef: React.RefObject<HTMLInputElement | null>
  uploading: boolean
  removing: boolean
  onUpload: (file: File) => void
  onRemove: () => void
  hasCustom: boolean
  previewSize?: number
}) {
  const url = currentUrl ?? defaultUrl
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{description}</p>
        <div className="flex items-center gap-4 flex-wrap">
          <div
            className="border rounded-md bg-muted/30 p-2 flex items-center justify-center"
            style={{ width: previewSize + 16, height: previewSize + 16 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={title}
              style={{ width: previewSize, height: previewSize }}
              className="object-contain"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onUpload(f)
                if (inputRef.current) inputRef.current.value = ''
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              Carregar
            </Button>
            {hasCustom && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                disabled={removing}
                className="text-red-600 hover:text-red-700"
              >
                {removing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                Remover (volta ao default)
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Limite: 1 MB. Formatos aceites: {accept.replace(/image\//g, '').replace(/,/g, ', ')}.
        </p>
      </CardContent>
    </Card>
  )
}
