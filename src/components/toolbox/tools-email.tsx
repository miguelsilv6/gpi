'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, ScanSearch, AlertTriangle, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ResultRow, CopyButton, postTool } from './toolbox-shared'
import type { EmailHeaderAnalysis } from '@/lib/toolbox/email-headers'

function AuthBadge({ label, result }: { label: string; result: string | null }) {
  const ok = result === 'pass'
  const fail = result === 'fail' || result === 'softfail'
  const Icon = ok ? CheckCircle2 : fail ? XCircle : MinusCircle
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
      {label}: {result ?? 'n/d'}
    </span>
  )
}

export function EmailHeadersTool() {
  const [headers, setHeaders] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EmailHeaderAnalysis | null>(null)

  async function run() {
    if (headers.trim().length < 10) return
    setLoading(true)
    setResult(null)
    const data = await postTool<EmailHeaderAnalysis>(
      '/api/toolbox/email-headers',
      { headers },
      toast.error,
    )
    if (data) setResult(data)
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tb-headers">Cabeçalho completo do email (raw headers)</Label>
        <Textarea
          id="tb-headers"
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
          rows={8}
          placeholder={'Received: from mail.exemplo.com ...\nFrom: "Nome" <user@dominio.com>\nSubject: ...'}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          No Outlook: Ficheiro → Propriedades → &quot;Cabeçalhos de Internet&quot;. No Gmail: ⋮ → &quot;Mostrar original&quot;.
          A análise é feita localmente no servidor — nada é enviado para serviços externos.
        </p>
      </div>
      <Button onClick={run} disabled={loading || headers.trim().length < 10} className="gap-1.5">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
        Analisar
      </Button>

      {result && (
        <div className="space-y-3">
          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20 p-3 space-y-1">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {w}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <AuthBadge label="SPF" result={result.spf} />
            <AuthBadge label="DKIM" result={result.dkim} />
            <AuthBadge label="DMARC" result={result.dmarc} />
          </div>

          <div className="rounded-lg border p-4">
            <ResultRow label="From" value={result.from} />
            <ResultRow label="Reply-To" value={result.replyTo} />
            <ResultRow label="Return-Path" value={result.returnPath} />
            <ResultRow label="To" value={result.to} />
            <ResultRow label="Assunto" value={result.subject} />
            <ResultRow label="Data" value={result.date} />
            <ResultRow label="Message-ID" value={result.messageId} />
            <ResultRow
              label="IP de origem"
              value={result.originIp ? <>{result.originIp} <CopyButton text={result.originIp} /></> : '—'}
            />
          </div>

          {result.received.length > 0 && (
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Cadeia de entrega ({result.received.length} hops, origem → destino)
              </p>
              <ol className="space-y-2">
                {result.received.map((hop, i) => (
                  <li key={i} className="text-xs flex gap-2">
                    <span className="font-mono text-muted-foreground shrink-0 w-5">{i + 1}.</span>
                    <div className="min-w-0">
                      <p className="font-mono break-all">
                        {hop.from ?? '?'} → {hop.by ?? '?'}
                        {hop.ip && <span className="text-blue-600 dark:text-blue-400"> [{hop.ip}]</span>}
                      </p>
                      <p className="text-muted-foreground">
                        {hop.timestamp ? new Date(hop.timestamp).toLocaleString('pt-PT') : 'sem data'}
                        {hop.delaySeconds != null && hop.delaySeconds > 0 && ` · +${hop.delaySeconds}s`}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
