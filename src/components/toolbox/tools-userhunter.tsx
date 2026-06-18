'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, FileText, FileSpreadsheet, FileDown, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { FonteNote, postTool, postToolFile } from './toolbox-shared'

interface FoundPlatform {
  name: string
  categoria: string
  url: string
  status: number
}

interface UserHunterResult {
  username: string
  plataformasAnalisadas: number
  encontrados: FoundPlatform[]
  elapsedMs: number
  fonte: string
}

type ExportFormat = 'csv' | 'md' | 'pdf'

export function UserHunterTool() {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  const [result, setResult] = useState<UserHunterResult | null>(null)

  const grupos = useMemo(() => {
    if (!result) return []
    const porCategoria = new Map<string, FoundPlatform[]>()
    for (const p of result.encontrados) {
      const lista = porCategoria.get(p.categoria) ?? []
      lista.push(p)
      porCategoria.set(p.categoria, lista)
    }
    return Array.from(porCategoria.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [result])

  async function run() {
    if (!username.trim()) return
    setLoading(true)
    setResult(null)
    const data = await postTool<UserHunterResult>(
      '/api/toolbox/userhunter',
      { username: username.trim() },
      toast.error,
    )
    if (data) setResult(data)
    setLoading(false)
  }

  async function exportar(format: ExportFormat) {
    if (!result) return
    setExporting(format)
    await postToolFile(
      '/api/toolbox/userhunter/export',
      {
        username: result.username,
        plataformasAnalisadas: result.plataformasAnalisadas,
        encontrados: result.encontrados,
        format,
      },
      `userhunter-${result.username}.${format === 'md' ? 'md' : format}`,
      toast.error,
    )
    setExporting(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="tb-userhunter">Username</Label>
          <Input
            id="tb-userhunter"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Ex: johndoe"
            onKeyDown={(e) => e.key === 'Enter' && run()}
            className="font-mono"
          />
        </div>
        <Button onClick={run} disabled={loading || !username.trim()} className="self-end gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Pesquisar
        </Button>
      </div>
      {loading && (
        <p className="text-xs text-muted-foreground">
          A verificar mais de 70 plataformas — pode demorar até cerca de um minuto…
        </p>
      )}

      {result && (
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {result.encontrados.length} de {result.plataformasAnalisadas} plataformas
              </Badge>
              <span className="text-xs text-muted-foreground">
                ({(result.elapsedMs / 1000).toFixed(1)}s)
              </span>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={result.encontrados.length === 0 || exporting !== null}
                onClick={() => exportar('md')}
              >
                {exporting === 'md' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                Markdown
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={result.encontrados.length === 0 || exporting !== null}
                onClick={() => exportar('csv')}
              >
                {exporting === 'csv' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                Excel
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={result.encontrados.length === 0 || exporting !== null}
                onClick={() => exportar('pdf')}
              >
                {exporting === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                PDF
              </Button>
            </div>
          </div>

          {result.encontrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum perfil encontrado nas plataformas analisadas.</p>
          ) : (
            <div className="space-y-3">
              {grupos.map(([categoria, plataformas]) => (
                <div key={categoria}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">{categoria}</p>
                  <ul className="space-y-1">
                    {plataformas.map((p) => (
                      <li key={p.name} className="flex items-center gap-2 text-sm">
                        <span className="font-medium w-32 shrink-0 truncate">{p.name}</span>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-primary hover:underline truncate flex items-center gap-1 min-w-0"
                        >
                          <span className="truncate">{p.url}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <FonteNote fonte={result.fonte} />
        </div>
      )}
    </div>
  )
}
