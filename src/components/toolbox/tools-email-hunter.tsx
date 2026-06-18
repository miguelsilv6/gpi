'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Search,
  FileText,
  FileSpreadsheet,
  FileDown,
  ExternalLink,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FonteNote, ResultRow, postTool, postToolFile } from './toolbox-shared'

interface SmtpVerifyResult {
  dominio: string
  servidorMx: string
  estado: 'valido' | 'invalido' | 'indeterminado'
  detalhe: string
}

interface EmailRepResult {
  disponivel: boolean
  reputacao: string | null
  suspeito: boolean | null
  referencias: number | null
  blacklisted: boolean | null
  atividadeMaliciosa: boolean | null
  credenciaisExpostas: boolean | null
  dataBreach: boolean | null
  primeiraVista: string | null
  ultimaVista: string | null
  spf: boolean | null
  dmarc: boolean | null
  deliverable: boolean | null
  freeProvider: boolean | null
  disposable: boolean | null
  perfis: string[]
  mensagem?: string
}

interface InfostealerRecord {
  data: string | null
  stealer: string | null
  os: string | null
  passwordParcial: string | null
  url: string | null
}

interface HudsonRockResult {
  disponivel: boolean
  encontrados: number
  registos: InfostealerRecord[]
  mensagem?: string
}

interface DomainBreach {
  nome: string
  data: string | null
  contasComprometidas: number
  dadosExpostos: string[]
}

interface BreachCheckResult {
  proxynova: { disponivel: boolean; total: number; amostra: string[]; mensagem?: string }
  hibp: { disponivel: boolean; breachesDominio: DomainBreach[]; mensagem?: string }
  linksManuais: { nome: string; url: string }[]
}

interface GravatarResult {
  encontrado: boolean
  displayName: string | null
  username: string | null
  perfilUrl: string | null
  avatarUrl: string
  bio: string | null
  redes: { rede: string; url: string }[]
  mensagem?: string
}

interface GoogleDork {
  descricao: string
  url: string
}

interface DomainInfoResult {
  dominio: string
  ip: string | null
  proveedor: string | null
  tipoProveedor: 'gratuito' | 'cifrado' | 'descartavel' | 'corporativo'
  registrar: string | null
  criado: string | null
  expira: string | null
}

interface EmailHunterResult {
  email: string
  smtp: SmtpVerifyResult
  emailRep: EmailRepResult
  hudsonRock: HudsonRockResult
  breachCheck: BreachCheckResult
  gravatar: GravatarResult
  googleDorks: GoogleDork[]
  domainInfo: DomainInfoResult
  elapsedMs: number
  fonte: string
}

type ExportFormat = 'csv' | 'md' | 'pdf'

const TIPO_PROVEEDOR_LABEL: Record<DomainInfoResult['tipoProveedor'], string> = {
  gratuito: 'Gratuito',
  cifrado: 'Cifrado',
  descartavel: 'Descartável',
  corporativo: 'Corporativo/privado',
}

function StateBadge({ value }: { value: 'valido' | 'invalido' | 'indeterminado' }) {
  const ok = value === 'valido'
  const fail = value === 'invalido'
  const Icon = ok ? CheckCircle2 : fail ? XCircle : MinusCircle
  const label = ok ? 'válido' : fail ? 'inválido' : 'indeterminado'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        ok && 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-900',
        fail && 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900',
        !ok && !fail && 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

function boolLabel(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v ? 'Sim' : 'Não'
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>
      {children}
    </div>
  )
}

export function EmailHunterTool() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const [result, setResult] = useState<EmailHunterResult | null>(null)

  async function run() {
    if (!email.trim()) return
    setLoading(true)
    setResult(null)
    const data = await postTool<EmailHunterResult>(
      '/api/toolbox/email-hunter',
      { email: email.trim() },
      toast.error,
    )
    if (data) setResult(data)
    setLoading(false)
  }

  async function exportar(format: ExportFormat) {
    if (!result) return
    setExporting(format)
    const resultado = {
      email: result.email,
      smtp: result.smtp,
      emailRep: result.emailRep,
      hudsonRock: result.hudsonRock,
      breachCheck: result.breachCheck,
      gravatar: result.gravatar,
      googleDorks: result.googleDorks,
      domainInfo: result.domainInfo,
      elapsedMs: result.elapsedMs,
    }
    await postToolFile(
      '/api/toolbox/email-hunter/export',
      { email: result.email, format, resultado },
      `email-hunter-${result.email}.${format === 'md' ? 'md' : format}`,
      toast.error,
    )
    setExporting(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="tb-emailhunter">Endereço de email</Label>
          <Input
            id="tb-emailhunter"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Ex: nome@dominio.com"
            onKeyDown={(e) => e.key === 'Enter' && run()}
            className="font-mono"
          />
        </div>
        <Button onClick={run} disabled={loading || !email.trim()} className="self-end gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Pesquisar
        </Button>
      </div>
      {loading && (
        <p className="text-xs text-muted-foreground">
          A correr SMTP Verify, EmailRep.io, HudsonRock, ProxyNova, HIBP, Gravatar e DNS/RDAP — pode demorar até cerca de 30 segundos…
        </p>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Pesquisa concluída em {(result.elapsedMs / 1000).toFixed(1)}s
            </span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="gap-1.5" disabled={exporting !== null} onClick={() => exportar('md')}>
                {exporting === 'md' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                Markdown
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" disabled={exporting !== null} onClick={() => exportar('csv')}>
                {exporting === 'csv' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                Excel
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" disabled={exporting !== null} onClick={() => exportar('pdf')}>
                {exporting === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                PDF
              </Button>
            </div>
          </div>

          <Section title="SMTP Verify">
            <div className="mb-2"><StateBadge value={result.smtp.estado} /></div>
            <ResultRow label="Domínio" value={result.smtp.dominio} />
            <ResultRow label="Servidor MX" value={result.smtp.servidorMx} />
            <ResultRow label="Detalhe" value={result.smtp.detalhe} />
          </Section>

          <Section title="EmailRep.io">
            {result.emailRep.disponivel ? (
              <>
                <ResultRow label="Reputação" value={result.emailRep.reputacao} />
                <ResultRow label="Suspeito" value={boolLabel(result.emailRep.suspeito)} />
                <ResultRow label="Blacklisted" value={boolLabel(result.emailRep.blacklisted)} />
                <ResultRow label="Atividade maliciosa" value={boolLabel(result.emailRep.atividadeMaliciosa)} />
                <ResultRow label="Credenciais expostas" value={boolLabel(result.emailRep.credenciaisExpostas)} />
                <ResultRow label="Em data breach" value={boolLabel(result.emailRep.dataBreach)} />
                <ResultRow label="Primeira vez visto" value={result.emailRep.primeiraVista} />
                <ResultRow label="Última vez visto" value={result.emailRep.ultimaVista} />
                <ResultRow label="SPF estrito" value={boolLabel(result.emailRep.spf)} />
                <ResultRow label="DMARC" value={boolLabel(result.emailRep.dmarc)} />
                <ResultRow label="Entregável" value={boolLabel(result.emailRep.deliverable)} />
                <ResultRow label="Provedor gratuito" value={boolLabel(result.emailRep.freeProvider)} />
                <ResultRow label="Descartável" value={boolLabel(result.emailRep.disposable)} />
                {result.emailRep.perfis.length > 0 && (
                  <ResultRow label="Perfis encontrados" value={result.emailRep.perfis.join(', ')} />
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{result.emailRep.mensagem ?? 'Sem dados.'}</p>
            )}
          </Section>

          <Section title="HudsonRock — Infostealers">
            <ResultRow label="Registos encontrados" value={result.hudsonRock.encontrados} />
            {result.hudsonRock.registos.length > 0 && (
              <ul className="mt-2 space-y-2">
                {result.hudsonRock.registos.map((reg, i) => (
                  <li key={i} className="text-xs border rounded p-2 space-y-0.5">
                    <p><span className="text-muted-foreground">Data:</span> {reg.data ?? '—'}</p>
                    <p><span className="text-muted-foreground">Stealer:</span> {reg.stealer ?? '—'}</p>
                    <p><span className="text-muted-foreground">SO:</span> {reg.os ?? '—'}</p>
                    <p><span className="text-muted-foreground">Senha (parcial):</span> <span className="font-mono">{reg.passwordParcial ?? '—'}</span></p>
                    {reg.url && (
                      <a href={reg.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        Fonte <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {result.hudsonRock.mensagem && <p className="text-sm text-muted-foreground mt-1">{result.hudsonRock.mensagem}</p>}
          </Section>

          <Section title="Breach Check — ProxyNova COMB / HIBP">
            <ResultRow label="ProxyNova — total" value={result.breachCheck.proxynova.total} />
            {result.breachCheck.proxynova.amostra.length > 0 && (
              <div className="mt-1 mb-2 space-y-0.5">
                {result.breachCheck.proxynova.amostra.map((linha, i) => (
                  <p key={i} className="text-xs font-mono break-all">{linha}</p>
                ))}
              </div>
            )}
            {result.breachCheck.proxynova.mensagem && (
              <p className="text-sm text-muted-foreground mb-2">{result.breachCheck.proxynova.mensagem}</p>
            )}
            {result.breachCheck.hibp.breachesDominio.length > 0 && (
              <ul className="space-y-2 mb-2">
                {result.breachCheck.hibp.breachesDominio.map((b, i) => (
                  <li key={i} className="text-xs border rounded p-2 space-y-0.5">
                    <p className="font-medium">{b.nome}</p>
                    <p><span className="text-muted-foreground">Data:</span> {b.data ?? '—'} · <span className="text-muted-foreground">Contas:</span> {b.contasComprometidas.toLocaleString('pt-PT')}</p>
                    {b.dadosExpostos.length > 0 && <p className="text-muted-foreground">Dados expostos: {b.dadosExpostos.join(', ')}</p>}
                  </li>
                ))}
              </ul>
            )}
            {result.breachCheck.hibp.mensagem && (
              <p className="text-sm text-muted-foreground mb-2">{result.breachCheck.hibp.mensagem}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {result.breachCheck.linksManuais.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  {l.nome} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </Section>

          <Section title="Gravatar">
            {result.gravatar.encontrado ? (
              <div className="flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.gravatar.avatarUrl} alt="Avatar Gravatar" className="h-16 w-16 rounded-full border shrink-0" />
                <div className="min-w-0 flex-1">
                  <ResultRow label="Nome" value={result.gravatar.displayName} />
                  <ResultRow label="Username" value={result.gravatar.username} />
                  <ResultRow
                    label="Perfil"
                    value={result.gravatar.perfilUrl ? (
                      <a href={result.gravatar.perfilUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {result.gravatar.perfilUrl}
                      </a>
                    ) : null}
                  />
                  <ResultRow label="Bio" value={result.gravatar.bio} />
                  {result.gravatar.redes.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {result.gravatar.redes.map((r, i) => (
                        <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                          {r.rede} <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{result.gravatar.mensagem ?? 'Nenhum perfil público associado a este email.'}</p>
            )}
          </Section>

          <Section title="Google Dorks">
            <div className="flex flex-wrap gap-2">
              {result.googleDorks.map((d, i) => (
                <a
                  key={i}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  {d.descricao} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </Section>

          <Section title="Domínio">
            <ResultRow label="Domínio" value={result.domainInfo.dominio} />
            <ResultRow label="IP" value={result.domainInfo.ip} />
            <ResultRow label="Tipo" value={TIPO_PROVEEDOR_LABEL[result.domainInfo.tipoProveedor]} />
            <ResultRow label="Provedor" value={result.domainInfo.proveedor} />
            <ResultRow label="Registrar" value={result.domainInfo.registrar} />
            <ResultRow label="Criado" value={result.domainInfo.criado} />
            <ResultRow label="Expira" value={result.domainInfo.expira} />
          </Section>

          <FonteNote fonte={result.fonte} />
        </div>
      )}
    </div>
  )
}
