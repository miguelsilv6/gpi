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
import { HelpButton, HelpSection } from '@/components/ui/help-button'

interface ReportRow {
  line: number
  nuipc: string
  nai: string
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
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Importar Inquéritos</h1>
          <p className="text-muted-foreground text-sm">Carregue inquéritos em lote a partir de um ficheiro CSV.</p>
        </div>
        <HelpButton title="Ajuda — Importação de Inquéritos" className="shrink-0">
          <HelpSection title="Formato do ficheiro">
            <p>O ficheiro deve ser um <strong>CSV</strong> com as colunas separadas por vírgula ou ponto-e-vírgula. Descarregue o <strong>modelo CSV</strong> para ver a estrutura exata.</p>
          </HelpSection>
          <HelpSection title="Colunas obrigatórias">
            <ul className="list-disc pl-4 space-y-0.5">
              <li><code>NUIPC</code> — número único do inquérito.</li>
              <li><code>NAI</code> — número de autos interno.</li>
            </ul>
          </HelpSection>
          <HelpSection title="Colunas opcionais (principais)">
            <ul className="list-disc pl-4 space-y-0.5">
              <li><code>Crime</code> — tem de existir no catálogo (pesquisa sem distinção de maiúsculas).</li>
              <li><code>Estado</code> — usa o primeiro estado ativo se omitido.</li>
              <li><code>Data Abertura</code> — formato <code>AAAA-MM-DD</code> ou <code>DD/MM/AAAA</code>.</li>
              <li><code>Brigada</code> / <code>Inspetor (email)</code> — têm de existir previamente.</li>
              <li><code>Prazo</code> / <code>Data Conclusão</code> — datas no mesmo formato.</li>
            </ul>
          </HelpSection>
          <HelpSection title="Processo de importação">
            <ol className="list-decimal pl-4 space-y-1">
              <li>Selecione o ficheiro CSV — é validado automaticamente.</li>
              <li>Reveja o relatório de validação: linhas com erros são assinaladas a vermelho.</li>
              <li>Se não houver erros críticos, clique <strong>Confirmar importação</strong> para gravar os inquéritos.</li>
            </ol>
            <p className="mt-1">Linhas com erros são ignoradas na importação; as restantes são importadas.</p>
          </HelpSection>
        </HelpButton>
      </div>
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
              Colunas obrigatórias: <code>NUIPC</code>, <code>NAI</code>. Todas as outras colunas são opcionais:{' '}
              <code>Crime</code>, <code>Estado</code>, <code>Data Abertura</code>,{' '}
              <code>Brigada</code>, <code>Inspetor (email)</code>, <code>Prazo</code>,{' '}
              <code>Data Conclusão</code>, <code>Tribunal</code>, <code>Procurador</code>,{' '}
              <code>Oficial de Justiça</code>, <code>VoIP</code>,{' '}
              <code>Notas Tribunal</code>, <code>Notas</code>,{' '}
              <code>Denunciante Nome</code>, <code>Denunciante NIF</code>,{' '}
              <code>Denunciante Morada</code>, <code>Denunciante Contacto</code>,{' '}
              <code>Denunciante Email</code>.
            </p>
            <p className="text-xs text-muted-foreground">
              Datas em <code>AAAA-MM-DD</code> ou <code>DD/MM/AAAA</code>. Quando omitidos:
              Estado usa o primeiro estado ativo, Data Abertura usa a data de hoje,
              Brigada usa a brigada do utilizador atual.
              Crime/Brigada/Inspetor têm de existir previamente no catálogo (pesquisa case-insensitive).
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
                    <TableHead>NAI</TableHead>
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
                        <TableCell className="font-mono text-xs">{r.nai || <span className="text-muted-foreground italic">—</span>}</TableCell>
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
