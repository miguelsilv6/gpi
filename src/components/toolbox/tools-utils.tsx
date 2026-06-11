'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, Hash, ArrowRightLeft, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { ResultRow, CopyButton, postTool } from './toolbox-shared'

interface HashResult {
  md5: string
  sha1: string
  sha256: string
  sha512: string
  bytes: number
}

export function HashTool() {
  const [texto, setTexto] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HashResult | null>(null)

  async function run() {
    if (!texto) return
    setLoading(true)
    setResult(null)
    const data = await postTool<HashResult>('/api/toolbox/hash', { texto }, toast.error)
    if (data) setResult(data)
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tb-hash">Texto a digerir</Label>
        <Textarea
          id="tb-hash"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder="Cole o texto para calcular os hashes…"
          className="font-mono text-xs"
        />
      </div>
      <Button onClick={run} disabled={loading || !texto} className="gap-1.5">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
        Calcular
      </Button>

      {result && (
        <div className="rounded-lg border p-4">
          <ResultRow label="MD5" value={<>{result.md5} <CopyButton text={result.md5} /></>} />
          <ResultRow label="SHA-1" value={<>{result.sha1} <CopyButton text={result.sha1} /></>} />
          <ResultRow label="SHA-256" value={<>{result.sha256} <CopyButton text={result.sha256} /></>} />
          <ResultRow label="SHA-512" value={<>{result.sha512} <CopyButton text={result.sha512} /></>} />
          <ResultRow label="Tamanho" value={`${result.bytes} bytes`} />
        </div>
      )}
    </div>
  )
}

type Codec = 'base64' | 'url' | 'hex'

function encode(text: string, codec: Codec): string {
  switch (codec) {
    case 'base64':
      return btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    case 'url':
      return encodeURIComponent(text)
    case 'hex':
      return Array.from(new TextEncoder().encode(text))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
  }
}

function decode(text: string, codec: Codec): string {
  switch (codec) {
    case 'base64': {
      const bin = atob(text.trim())
      return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
    }
    case 'url':
      return decodeURIComponent(text.trim())
    case 'hex': {
      const clean = text.trim().replace(/\s+/g, '')
      if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) throw new Error('hex inválido')
      const bytes = new Uint8Array(clean.length / 2)
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
      }
      return new TextDecoder().decode(bytes)
    }
  }
}

export function EncoderTool() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [codec, setCodec] = useState<Codec>('base64')

  function run(direction: 'encode' | 'decode') {
    try {
      setOutput(direction === 'encode' ? encode(input, codec) : decode(input, codec))
    } catch {
      toast.error(`Entrada inválida para ${direction === 'decode' ? 'descodificar' : 'codificar'} ${codec}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['base64', 'url', 'hex'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCodec(c)}
            className={
              'rounded-full border px-3 py-1 text-xs transition-colors ' +
              (codec === c
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-muted')
            }
          >
            {c === 'base64' ? 'Base64' : c === 'url' ? 'URL' : 'Hex'}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tb-enc-in">Entrada</Label>
        <Textarea
          id="tb-enc-in"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          className="font-mono text-xs"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => run('encode')} disabled={!input} variant="outline" className="gap-1.5">
          <ArrowRightLeft className="h-4 w-4" />
          Codificar
        </Button>
        <Button onClick={() => run('decode')} disabled={!input} variant="outline" className="gap-1.5">
          <ArrowRightLeft className="h-4 w-4 rotate-180" />
          Descodificar
        </Button>
      </div>
      {output && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label>Resultado</Label>
            <CopyButton text={output} />
          </div>
          <Textarea value={output} readOnly rows={4} className="font-mono text-xs bg-muted/50" />
        </div>
      )}
    </div>
  )
}

/** Defang/refang de IOCs para partilha segura (hxxp://, [.]). */
function defang(text: string): string {
  return text
    .replace(/http(s?):\/\//gi, 'hxxp$1://')
    .replace(/\./g, '[.]')
    .replace(/@/g, '[@]')
}

function refang(text: string): string {
  return text
    .replace(/\[\.\]/g, '.')
    .replace(/\(\.\)/g, '.')
    .replace(/\[@\]/g, '@')
    .replace(/hxxps?/gi, (m) => m.replace(/xx/i, 'tt'))
}

export function DefangTool() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tb-defang-in">URLs / domínios / emails (um por linha ou texto livre)</Label>
        <Textarea
          id="tb-defang-in"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          placeholder="https://malicioso.example.com/payload"
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          &quot;Defang&quot; neutraliza IOCs para partilha segura em relatórios (https → hxxps, . → [.]);
          &quot;Refang&quot; reverte.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => setOutput(defang(input))} disabled={!input} variant="outline" className="gap-1.5">
          <ShieldOff className="h-4 w-4" />
          Defang
        </Button>
        <Button onClick={() => setOutput(refang(input))} disabled={!input} variant="outline" className="gap-1.5">
          <ArrowRightLeft className="h-4 w-4" />
          Refang
        </Button>
      </div>
      {output && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label>Resultado</Label>
            <CopyButton text={output} />
          </div>
          <Textarea value={output} readOnly rows={4} className="font-mono text-xs bg-muted/50" />
        </div>
      )}
    </div>
  )
}
