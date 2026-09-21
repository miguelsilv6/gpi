'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { ResultRow, CopyButton, FonteNote, postTool } from './toolbox-shared'

interface IpLookupResult {
  query: string
  tipo: string
  country: string
  countryCode: string
  continent: string
  regionName: string
  city: string
  zip: string
  lat: number | null
  lon: number | null
  timezone: string
  isp: string
  org: string
  asn: string
  asDomain: string
  reverse: string
  fonte: string
}

export function IpLookupTool() {
  const [ip, setIp] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<IpLookupResult | null>(null)

  async function run() {
    if (!ip.trim()) return
    setLoading(true)
    setResult(null)
    const data = await postTool<IpLookupResult>('/api/toolbox/ip-lookup', { ip: ip.trim() }, toast.error)
    if (data) setResult(data)
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="tb-ip">Endereço IP (v4 ou v6)</Label>
          <Input
            id="tb-ip"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="Ex: 8.8.8.8"
            onKeyDown={(e) => e.key === 'Enter' && run()}
            className="font-mono"
          />
        </div>
        <Button onClick={run} disabled={loading || !ip.trim()} className="self-end gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Pesquisar
        </Button>
      </div>

      {result && (
        <div className="rounded-lg border p-4">
          <ResultRow label="IP" value={<>{result.query} <CopyButton text={result.query} /></>} />
          <ResultRow label="País" value={`${result.country} (${result.countryCode})${result.continent ? ` — ${result.continent}` : ''}`} />
          <ResultRow label="Região / Cidade" value={`${result.regionName} / ${result.city}${result.zip ? ` (${result.zip})` : ''}`} />
          <ResultRow
            label="Coordenadas"
            value={result.lat !== null && result.lon !== null ? `${result.lat}, ${result.lon}` : '—'}
          />
          <ResultRow label="Fuso horário" value={result.timezone || '—'} />
          <ResultRow label="ISP" value={result.isp || '—'} />
          <ResultRow label="Organização" value={result.org || '—'} />
          <ResultRow label="ASN" value={`${result.asn}${result.asDomain ? ` (${result.asDomain})` : ''}` || '—'} />
          <ResultRow label="Reverse DNS" value={result.reverse || '—'} />
          <FonteNote fonte={result.fonte} />
        </div>
      )}
    </div>
  )
}

interface DnsResult {
  tipo: 'forward' | 'reverse'
  query: string
  ptr?: string[]
  a?: string[]
  aaaa?: string[]
  mx?: { exchange: string; priority: number }[]
  ns?: string[]
  txt?: string[]
  cname?: string[]
  fonte: string
}

export function DnsTool() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DnsResult | null>(null)

  async function run() {
    if (!query.trim()) return
    setLoading(true)
    setResult(null)
    const data = await postTool<DnsResult>('/api/toolbox/dns', { query: query.trim() }, toast.error)
    if (data) setResult(data)
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="tb-dns">Domínio ou IP (reverse)</Label>
          <Input
            id="tb-dns"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: example.com ou 8.8.8.8"
            onKeyDown={(e) => e.key === 'Enter' && run()}
            className="font-mono"
          />
        </div>
        <Button onClick={run} disabled={loading || !query.trim()} className="self-end gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Resolver
        </Button>
      </div>

      {result?.tipo === 'reverse' && (
        <div className="rounded-lg border p-4">
          <ResultRow label="PTR" value={(result.ptr ?? []).join(', ') || '—'} />
          <FonteNote fonte={result.fonte} />
        </div>
      )}
      {result?.tipo === 'forward' && (
        <div className="rounded-lg border p-4">
          <ResultRow label="A" value={(result.a ?? []).join(', ') || '—'} />
          <ResultRow label="AAAA" value={(result.aaaa ?? []).join(', ') || '—'} />
          <ResultRow
            label="MX"
            value={(result.mx ?? []).map((m) => `${m.priority} ${m.exchange}`).join(' · ') || '—'}
          />
          <ResultRow label="NS" value={(result.ns ?? []).join(', ') || '—'} />
          <ResultRow label="CNAME" value={(result.cname ?? []).join(', ') || '—'} />
          {(result.txt ?? []).length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">TXT</p>
              <ul className="space-y-1">
                {(result.txt ?? []).map((t, i) => (
                  <li key={i} className="text-xs font-mono break-all bg-muted/50 rounded px-2 py-1">{t}</li>
                ))}
              </ul>
            </div>
          )}
          <FonteNote fonte={result.fonte} />
        </div>
      )}
    </div>
  )
}

interface WhoisResult {
  query: string
  tipo: 'ip' | 'domain'
  handle: string | null
  nome: string | null
  registrar: string | null
  estados: string[]
  criado: string | null
  atualizado: string | null
  expira: string | null
  nameservers: string[]
  startAddress: string | null
  endAddress: string | null
  country: string | null
  fonte: string
}

function fmtRdapDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-PT')
}

export function WhoisTool() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WhoisResult | null>(null)

  async function run() {
    if (!query.trim()) return
    setLoading(true)
    setResult(null)
    const data = await postTool<WhoisResult>('/api/toolbox/whois', { query: query.trim() }, toast.error)
    if (data) setResult(data)
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="tb-whois">Domínio ou IP</Label>
          <Input
            id="tb-whois"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: example.com"
            onKeyDown={(e) => e.key === 'Enter' && run()}
            className="font-mono"
          />
        </div>
        <Button onClick={run} disabled={loading || !query.trim()} className="self-end gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Consultar
        </Button>
      </div>

      {result && (
        <div className="rounded-lg border p-4">
          <ResultRow label={result.tipo === 'ip' ? 'Bloco' : 'Domínio'} value={String(result.nome ?? result.handle ?? result.query)} />
          {result.tipo === 'domain' && <ResultRow label="Registrar" value={result.registrar ?? '—'} />}
          <ResultRow label="Criado" value={fmtRdapDate(result.criado)} />
          <ResultRow label="Atualizado" value={fmtRdapDate(result.atualizado)} />
          {result.tipo === 'domain' && <ResultRow label="Expira" value={fmtRdapDate(result.expira)} />}
          {result.estados.length > 0 && <ResultRow label="Estados" value={result.estados.join(', ')} />}
          {result.nameservers.length > 0 && (
            <ResultRow label="Nameservers" value={result.nameservers.join(', ')} />
          )}
          {result.tipo === 'ip' && (
            <>
              <ResultRow label="Intervalo" value={`${result.startAddress ?? '?'} — ${result.endAddress ?? '?'}`} />
              <ResultRow label="País" value={result.country ?? '—'} />
            </>
          )}
          <FonteNote fonte={result.fonte} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Consulta via RDAP (sucessor do WHOIS). Alguns TLDs nacionais (ex: .pt) podem não estar disponíveis.
      </p>
    </div>
  )
}
