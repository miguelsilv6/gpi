'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'

interface ApiResponse {
  ano: number
  mes: number
  atividadesPadrao: { id: string; nome: string }[]
  brigadas: { id: string; nome: string }[]
  counts: Record<string, Record<string, number>>
  totalGeral: number
}

const MES_LABEL: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
  5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
  9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
}

export function EstatisticaMensalView() {
  const now = new Date()
  const [ano, setAno] = useState(now.getFullYear())
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ ano: String(ano), mes: String(mes) })
      const res = await fetch(`/api/estatistica-mensal?${params}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j?.error ?? `Erro ${res.status}`)
        setData(null)
      } else {
        setData(await res.json())
      }
    } catch {
      setError('Falha de rede')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [ano, mes])

  useEffect(() => { fetchData() }, [fetchData])

  // Year options: current year ± 5
  const anoOptions = useMemo(() => {
    const current = now.getFullYear()
    const arr: number[] = []
    for (let y = current - 5; y <= current + 1; y++) arr.push(y)
    return arr.reverse()
  }, [now])

  function previousMonth() {
    if (mes === 1) { setAno(ano - 1); setMes(12) }
    else setMes(mes - 1)
  }

  function nextMonth() {
    if (mes === 12) { setAno(ano + 1); setMes(1) }
    else setMes(mes + 1)
  }

  function handleExport(format: 'csv' | 'md') {
    const params = new URLSearchParams({ ano: String(ano), mes: String(mes), format })
    window.open(`/api/estatistica-mensal/export?${params}`, '_blank')
  }

  // Compute row and column totals for display
  const { rowTotals, colTotals } = useMemo(() => {
    const rt: Record<string, number> = {}
    const ct: Record<string, number> = {}
    if (!data) return { rowTotals: rt, colTotals: ct }
    for (const p of data.atividadesPadrao) {
      let row = 0
      for (const b of data.brigadas) {
        const v = data.counts[p.nome]?.[b.id] ?? 0
        row += v
        ct[b.id] = (ct[b.id] ?? 0) + v
      }
      rt[p.nome] = row
    }
    return { rowTotals: rt, colTotals: ct }
  }, [data])

  const hasMatrix =
    data && data.atividadesPadrao.length > 0 && data.brigadas.length > 0

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Mês</Label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="h-9 w-[150px] text-sm">
              <SelectValue placeholder="Mês">
                {(v: string) => MES_LABEL[Number(v)] ?? v}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MES_LABEL).map(([n, label]) => (
                <SelectItem key={n} value={n}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ano</Label>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="h-9 w-[110px] text-sm">
              <SelectValue placeholder="Ano">
                {(v: string) => v}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {anoOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={previousMonth}
            className="h-9 w-9 p-0"
            title="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={nextMonth}
            className="h-9 w-9 p-0"
            title="Mês seguinte"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('csv')}
            disabled={!hasMatrix || loading}
          >
            <Download className="h-4 w-4 mr-1.5" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('md')}
            disabled={!hasMatrix || loading}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Markdown
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Período: <span className="font-medium text-foreground">{MES_LABEL[mes]} {ano}</span>
        {data && (
          <>
            {' · '}Total geral: <span className="font-medium text-foreground">{data.totalGeral}</span>
          </>
        )}
      </p>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-sm text-muted-foreground py-10 text-center">A carregar...</div>
          ) : error ? (
            <div className="text-sm text-red-600 py-10 text-center">{error}</div>
          ) : !hasMatrix ? (
            <div className="text-sm text-muted-foreground py-10 text-center">
              {data && data.atividadesPadrao.length === 0
                ? 'Nenhuma atividade padrão ativa para estatística.'
                : 'Nenhuma brigada disponível.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10">
                    Atividade Padrão
                  </TableHead>
                  {data!.brigadas.map((b) => (
                    <TableHead key={b.id} className="text-right">{b.nome}</TableHead>
                  ))}
                  <TableHead className="text-right font-semibold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.atividadesPadrao.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="sticky left-0 bg-background z-10 font-medium">
                      {p.nome}
                    </TableCell>
                    {data!.brigadas.map((b) => {
                      const v = data!.counts[p.nome]?.[b.id] ?? 0
                      return (
                        <TableCell
                          key={b.id}
                          className={
                            'text-right tabular-nums ' +
                            (v === 0 ? 'text-muted-foreground' : '')
                          }
                        >
                          {v}
                        </TableCell>
                      )
                    })}
                    <TableCell className="text-right font-semibold tabular-nums">
                      {rowTotals[p.nome] ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="sticky left-0 bg-muted/50 z-10 font-semibold">
                    Total
                  </TableCell>
                  {data!.brigadas.map((b) => (
                    <TableCell key={b.id} className="text-right font-semibold tabular-nums">
                      {colTotals[b.id] ?? 0}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-bold tabular-nums">
                    {data!.totalGeral}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
