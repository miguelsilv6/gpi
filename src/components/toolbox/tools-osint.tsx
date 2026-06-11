'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Search, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { FonteNote, CopyButton, ExplainButton, postTool } from './toolbox-shared'

function fmtData(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-PT')
}

interface CertHistoryResult {
  domain: string
  totalCertificados: number
  nomes: { nome: string; primeiraVez: string; ultimaVez: string; emissor: string }[]
  fonte: string
}

/** Histórico de certificados + subdomínios via Certificate Transparency. */
export function CertHistoryTool() {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CertHistoryResult | null>(null)

  async function run() {
    if (!domain.trim()) return
    setLoading(true)
    setResult(null)
    const data = await postTool<CertHistoryResult>('/api/toolbox/cert-history', { domain: domain.trim() }, toast.error)
    if (data) setResult(data)
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="tb-certs">Domínio</Label>
          <Input
            id="tb-certs"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="Ex: example.com"
            onKeyDown={(e) => e.key === 'Enter' && run()}
            className="font-mono"
          />
        </div>
        <Button onClick={run} disabled={loading || !domain.trim()} className="self-end gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Pesquisar
        </Button>
      </div>
      {loading && (
        <p className="text-xs text-muted-foreground">
          A consultar os logs de Certificate Transparency — pode demorar até 20 segundos…
        </p>
      )}

      {result && (
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm">
            <span className="font-semibold">{result.nomes.length}</span> nomes únicos encontrados em{' '}
            <span className="font-semibold">{result.totalCertificados}</span> certificados emitidos para{' '}
            <span className="font-mono">{result.domain}</span> e subdomínios.
          </p>
          {result.nomes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-3 font-medium">Nome (subdomínio)</th>
                    <th className="py-1.5 pr-3 font-medium">Primeira emissão</th>
                    <th className="py-1.5 pr-3 font-medium">Última emissão</th>
                  </tr>
                </thead>
                <tbody>
                  {result.nomes.map((n) => (
                    <tr key={n.nome} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 font-mono break-all">
                        {n.nome} <CopyButton text={n.nome} />
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{fmtData(n.primeiraVez)}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{fmtData(n.ultimaVez)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <FonteNote fonte={result.fonte} />
          <ExplainButton ferramenta="certs" resultado={result} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Os logs de Certificate Transparency registam todos os certificados TLS emitidos publicamente —
        revelam subdomínios históricos e atuais de um domínio, mesmo os já desativados.
      </p>
    </div>
  )
}

interface WebHistoryResult {
  query: string
  capturas: { timestamp: string; original: string; statuscode: string; mimetype: string; url: string }[]
  fonte: string
}

function fmtWaybackTs(ts: string): string {
  // YYYYMMDDhhmmss → DD/MM/YYYY hh:mm
  if (!/^\d{14}$/.test(ts)) return ts
  return `${ts.slice(6, 8)}/${ts.slice(4, 6)}/${ts.slice(0, 4)} ${ts.slice(8, 10)}:${ts.slice(10, 12)}`
}

/** Histórico de capturas na Wayback Machine. */
export function WebHistoryTool() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WebHistoryResult | null>(null)

  async function run() {
    if (!url.trim()) return
    setLoading(true)
    setResult(null)
    const data = await postTool<WebHistoryResult>('/api/toolbox/web-history', { url: url.trim() }, toast.error)
    if (data) setResult(data)
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="tb-wayback">URL ou domínio</Label>
          <Input
            id="tb-wayback"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Ex: example.com ou example.com/pagina"
            onKeyDown={(e) => e.key === 'Enter' && run()}
            className="font-mono"
          />
        </div>
        <Button onClick={run} disabled={loading || !url.trim()} className="self-end gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Pesquisar
        </Button>
      </div>

      {result && (
        <div className="rounded-lg border p-4 space-y-3">
          {result.capturas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem capturas arquivadas para <span className="font-mono">{result.query}</span>.
            </p>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-semibold">{result.capturas.length}</span> capturas arquivadas
                (máx. uma por mês) para <span className="font-mono">{result.query}</span>.
              </p>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-1.5 pr-3 font-medium">Data da captura</th>
                      <th className="py-1.5 pr-3 font-medium">HTTP</th>
                      <th className="py-1.5 pr-3 font-medium">Ver versão arquivada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.capturas.map((c) => (
                      <tr key={c.timestamp + c.original} className="border-b last:border-0">
                        <td className="py-1.5 pr-3 whitespace-nowrap">{fmtWaybackTs(c.timestamp)}</td>
                        <td className="py-1.5 pr-3">{c.statuscode || '—'}</td>
                        <td className="py-1.5 pr-3">
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline break-all"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            abrir snapshot
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <FonteNote fonte={result.fonte} />
          <ExplainButton ferramenta="wayback" resultado={result} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        A Wayback Machine arquiva versões históricas de páginas web — útil para recuperar conteúdo
        removido ou verificar como um site estava numa data específica.
      </p>
    </div>
  )
}
