'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReportRow {
  line: number
  nuipc: string
  crime: string
  brigada: string
  inspetor: string
  estado: string
  dataAbertura: string
  errors: string[]
}

interface Report {
  totalRows: number
  okCount: number
  errorCount: number
  canCommit: boolean
  rows: ReportRow[]
  /** Present only on commit response. */
  committed?: number
}

export function ImportarInqueritosView() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [csv, setCsv] = useState<string>('')
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)

  function reset() {
    setReport(null)
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    setFile(f ?? null)
    setReport(null)
    setCsv('')
    if (!f) return
    if (f.size > 1_000_000) {
      toast.error('Ficheiro demasiado grande (limite 1 MB)')
      return
    }
    try {
      const text = await f.text()
      setCsv(text)
    } catch {
      toast.error('Não foi possível ler o ficheiro')
    }
  }

  async function preview() {
    if (!csv) return
    setLoading(true)
    setReport(null)
    try {
      const res = await fetch('/api/inqueritos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, confirm: false }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro a validar o ficheiro')
        return
      }
      setReport(await res.json())
    } catch {
      toast.error('Erro de rede')
    } finally {
      setLoading(false)
    }
  }

  async function commit() {
    if (!csv || !report?.canCommit) return
    setImporting(true)
    try {
      const res = await fetch('/api/inqueritos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, confirm: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao importar')
        return
      }
      const body: Report = await res.json()
      toast.success(`${body.committed ?? 0} inquérito(s) importado(s)`)
      router.push('/inqueritos')
      router.refresh()
    } catch {
      toast.error('Erro de rede')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ficheiro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              <Link
                href="/api/inqueritos/import"
                className="text-blue-600 hover:underline"
              >
                Descarregar modelo CSV
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Colunas obrigatórias: <code>NUIPC</code>, <code>Crime</code>,{' '}
              <code>Estado</code>, <code>Data Abertura</code>,{' '}
              <code>Brigada</code>. Opcionais: <code>NAI</code>,{' '}
              <code>Prazo</code>, <code>Data Conclusão</code>,{' '}
              <code>Inspetor (email)</code>, <code>Tribunal</code>,{' '}
              <code>Procurador</code>, <code>Oficial de Justiça</code>,{' '}
              <code>VoIP</code>, <code>Notas Tribunal</code>, <code>Notas</code>.
            </p>
            <p className="text-xs text-muted-foreground">
              Datas em <code>AAAA-MM-DD</code> ou <code>DD/MM/AAAA</code>. Estado pelo código
              (ex: <code>ABERTO</code>) ou pelo nome. Crime/Brigada/Inspetor têm de existir
              previamente no catálogo (pesquisa case-insensitive).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="csv-file">Selecionar ficheiro CSV</Label>
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={onFileChange}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-foreground hover:file:bg-muted/80"
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={preview} disabled={!csv || loading}>
              {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              <FileUp className="h-4 w-4 mr-1.5" />
              Pré-visualizar
            </Button>
            {report && (
              <Button variant="outline" onClick={reset}>
                Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {report.errorCount === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              Resultado da validação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total: </span>
                <span className="font-medium">{report.totalRows}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Válidos: </span>
                <span className="font-medium text-green-700">{report.okCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Com erro: </span>
                <span
                  className={cn(
                    'font-medium',
                    report.errorCount > 0 ? 'text-red-700' : 'text-muted-foreground',
                  )}
                >
                  {report.errorCount}
                </span>
              </div>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">L.</TableHead>
                    <TableHead className="w-20">Estado</TableHead>
                    <TableHead>NUIPC</TableHead>
                    <TableHead>Crime</TableHead>
                    <TableHead>Brigada</TableHead>
                    <TableHead>Inspetor</TableHead>
                    <TableHead>Erros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((r) => {
                    const ok = r.errors.length === 0
                    return (
                      <TableRow key={r.line} className={cn(!ok && 'bg-red-50/40 dark:bg-red-950/10')}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {r.line}
                        </TableCell>
                        <TableCell>
                          {ok ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700">
                              <CheckCircle2 className="h-3 w-3" />
                              OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-700">
                              <AlertTriangle className="h-3 w-3" />
                              Erro
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.nuipc}</TableCell>
                        <TableCell className="text-xs">{r.crime}</TableCell>
                        <TableCell className="text-xs">{r.brigada}</TableCell>
                        <TableCell className="text-xs">{r.inspetor || <span className="text-muted-foreground italic">—</span>}</TableCell>
                        <TableCell className="text-xs text-red-700">
                          {r.errors.length > 0 ? (
                            <ul className="list-disc list-inside space-y-0.5">
                              {r.errors.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                          ) : (
                            ''
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end">
              <Button onClick={commit} disabled={!report.canCommit || importing}>
                {importing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                <Upload className="h-4 w-4 mr-1.5" />
                Importar {report.okCount} inquérito{report.okCount === 1 ? '' : 's'}
              </Button>
            </div>
            {!report.canCommit && report.errorCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Corrija os erros assinalados acima e volte a pré-visualizar.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
