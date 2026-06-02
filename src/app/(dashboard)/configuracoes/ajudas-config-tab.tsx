'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

interface AjudasConfig {
  vencimentoBase: number
  vencimentoDN: number
  percentPiqueteSemana: number
  percentPiqueteFds: number
  percentPrevencaoPassiva: number
  senhaAlojamento: number
  senhaAlmoco: number
  senhaJantar: number
  senhaCeia: number
  taxaIRS: number
  taxaSS: number
  distanciaMinKmAjudas: number
}

function fmtEur(n: number) {
  return `€${n.toFixed(2)}`
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function DerivedRates({ config }: { config: AjudasConfig }) {
  const taxaSemanaDia    = (config.vencimentoBase * config.percentPiqueteSemana) / 12
  const taxaSemanaNoite  = taxaSemanaDia * 2
  const taxaFdsDia       = (config.vencimentoBase * config.percentPiqueteFds) / 12
  const taxaFdsNoite     = taxaFdsDia * 2
  const taxaPiqueteSemana = config.vencimentoBase * config.percentPiqueteSemana
  const taxaPiqueteFds    = config.vencimentoBase * config.percentPiqueteFds
  // Prevenção passiva = percentPrevencaoPassiva (padrão 40%) do piquete do mesmo tipo de dia
  const taxaPrevencaoSemana = taxaPiqueteSemana * config.percentPrevencaoPassiva
  const taxaPrevencaoFds    = taxaPiqueteFds    * config.percentPrevencaoPassiva

  const Row = ({ label, value, formula }: { label: string; value: string; formula: string }) => (
    <div className="flex items-center justify-between py-1 border-b gap-2">
      <div className="flex flex-col min-w-0">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="text-xs text-muted-foreground/60 font-mono">{formula}</span>
      </div>
      <span className="font-medium text-sm whitespace-nowrap">{value}</span>
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Taxas Calculadas (leitura)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Horas Extra</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <Row
              label="Semana 08-24h"
              value={`${fmtEur(taxaSemanaDia)}/h`}
              formula={`venc × piq% ÷ 12 = ${fmtEur(config.vencimentoBase)} × ${pct(config.percentPiqueteSemana)} ÷ 12`}
            />
            <Row
              label="Semana 00-08h"
              value={`${fmtEur(taxaSemanaNoite)}/h`}
              formula={`semana-dia × 2 = ${fmtEur(taxaSemanaDia)} × 2`}
            />
            <Row
              label="FdS/Feriado 08-24h"
              value={`${fmtEur(taxaFdsDia)}/h`}
              formula={`venc × piq_fds% ÷ 12 = ${fmtEur(config.vencimentoBase)} × ${pct(config.percentPiqueteFds)} ÷ 12`}
            />
            <Row
              label="FdS/Feriado 00-08h"
              value={`${fmtEur(taxaFdsNoite)}/h`}
              formula={`fds-dia × 2 = ${fmtEur(taxaFdsDia)} × 2`}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Piquete</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <Row
              label="Piquete Semana"
              value={`${fmtEur(taxaPiqueteSemana)}/período`}
              formula={`venc × piq% = ${fmtEur(config.vencimentoBase)} × ${pct(config.percentPiqueteSemana)}`}
            />
            <Row
              label="Piquete FdS/Feriado"
              value={`${fmtEur(taxaPiqueteFds)}/período`}
              formula={`venc × piq_fds% = ${fmtEur(config.vencimentoBase)} × ${pct(config.percentPiqueteFds)}`}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Prevenção Passiva</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <Row
              label="Dia de Semana"
              value={`${fmtEur(taxaPrevencaoSemana)}/dia`}
              formula={`piquete semana × ${pct(config.percentPrevencaoPassiva)} = ${fmtEur(taxaPiqueteSemana)} × ${pct(config.percentPrevencaoPassiva)}`}
            />
            <Row
              label="FdS/Feriado"
              value={`${fmtEur(taxaPrevencaoFds)}/dia`}
              formula={`piquete FdS × ${pct(config.percentPrevencaoPassiva)} = ${fmtEur(taxaPiqueteFds)} × ${pct(config.percentPrevencaoPassiva)}`}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Ajudas de Custo</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <Row
              label="Almoço"
              value={`${fmtEur(config.senhaAlmoco)}/refeição`}
              formula="valor direto configurado"
            />
            <Row
              label="Jantar"
              value={`${fmtEur(config.senhaJantar)}/refeição`}
              formula="valor direto configurado"
            />
            <Row
              label="Alojamento"
              value={`${fmtEur(config.senhaAlojamento)}/noite`}
              formula="valor direto configurado"
            />
          </div>
        </div>

      </CardContent>
    </Card>
  )
}

export function AjudasConfigTab() {
  const [config, setConfig] = useState<AjudasConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/ajudas-config')
      .then((r) => r.json())
      .then((d) => {
        setConfig(d)
        setLoading(false)
      })
      .catch(() => {
        toast.error('Erro ao carregar configuração')
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    if (!config) return
    setSaving(true)
    try {
      const res = await fetch('/api/ajudas-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Erro ao guardar')
        return
      }
      const updated = await res.json()
      setConfig(updated)
      toast.success('Configuração guardada')
    } catch {
      toast.error('Erro ao guardar')
    } finally {
      setSaving(false)
    }
  }

  function set<K extends keyof AjudasConfig>(key: K, value: AjudasConfig[K]) {
    if (!config) return
    setConfig({ ...config, [key]: value })
  }

  function setNum(key: keyof AjudasConfig, raw: string, isInt = false) {
    if (raw === '') { set(key, 0 as never); return }
    const v = isInt ? parseInt(raw, 10) : parseFloat(raw)
    if (!isNaN(v)) set(key, v as never)
  }

  function setNumPct(key: keyof AjudasConfig, raw: string) {
    if (raw === '') { set(key, 0 as never); return }
    const v = parseFloat(raw)
    if (!isNaN(v)) set(key, (v / 100) as never)
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">A carregar...</div>
  }

  if (!config) return null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

        {/* Vencimentos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vencimentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="vencimentoBase">Vencimento Base (€)</Label>
              <Input
                id="vencimentoBase"
                type="number"
                step="0.01"
                value={config.vencimentoBase}
                onChange={(e) => setNum('vencimentoBase', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vencimentoDN">Vencimento DN (€)</Label>
              <Input
                id="vencimentoDN"
                type="number"
                step="0.001"
                value={config.vencimentoDN}
                onChange={(e) => setNum('vencimentoDN', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Percentagens */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Percentagens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="percentPiqueteSemana">Piquete Semana (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="percentPiqueteSemana"
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={(config.percentPiqueteSemana * 100).toFixed(1)}
                  onChange={(e) => setNumPct('percentPiqueteSemana', e.target.value)}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap min-w-[90px] text-right">
                  {fmtEur(config.vencimentoBase * config.percentPiqueteSemana)}/período
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="percentPiqueteFds">Piquete FdS (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="percentPiqueteFds"
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={(config.percentPiqueteFds * 100).toFixed(1)}
                  onChange={(e) => setNumPct('percentPiqueteFds', e.target.value)}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap min-w-[90px] text-right">
                  {fmtEur(config.vencimentoBase * config.percentPiqueteFds)}/período
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="percentPrevencaoPassiva">Prevenção Passiva (% do piquete)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="percentPrevencaoPassiva"
                  type="number"
                  step="1"
                  min={0}
                  max={100}
                  value={(config.percentPrevencaoPassiva * 100).toFixed(0)}
                  onChange={(e) => setNumPct('percentPrevencaoPassiva', e.target.value)}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap min-w-[90px] text-right">
                  {(config.percentPrevencaoPassiva * 100).toFixed(0)}% do piquete
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taxaIRS">Taxa IRS (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="taxaIRS"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={(config.taxaIRS * 100).toFixed(2)}
                  onChange={(e) => setNumPct('taxaIRS', e.target.value)}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap min-w-[90px] text-right">
                  {(config.taxaIRS * 100).toFixed(2)}%
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taxaSS">Taxa SS (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="taxaSS"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={(config.taxaSS * 100).toFixed(2)}
                  onChange={(e) => setNumPct('taxaSS', e.target.value)}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap min-w-[90px] text-right">
                  {(config.taxaSS * 100).toFixed(2)}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Valores das Refeições e Alojamento */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Valores das Refeições</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="senhaAlmoco">Almoço (€)</Label>
              <Input
                id="senhaAlmoco"
                type="number"
                step="0.01"
                value={config.senhaAlmoco}
                onChange={(e) => setNum('senhaAlmoco', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senhaJantar">Jantar (€)</Label>
              <Input
                id="senhaJantar"
                type="number"
                step="0.01"
                value={config.senhaJantar}
                onChange={(e) => setNum('senhaJantar', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senhaCeia">Ceia (€)</Label>
              <Input
                id="senhaCeia"
                type="number"
                step="0.01"
                value={config.senhaCeia}
                onChange={(e) => setNum('senhaCeia', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senhaAlojamento">Alojamento (€/noite)</Label>
              <Input
                id="senhaAlojamento"
                type="number"
                step="0.01"
                value={config.senhaAlojamento}
                onChange={(e) => setNum('senhaAlojamento', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Ajudas de Custo — condições de aplicação */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajudas de Custo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="distanciaMinKmAjudas">Distância Mínima (km)</Label>
              <Input
                id="distanciaMinKmAjudas"
                type="number"
                step="1"
                min={0}
                value={config.distanciaMinKmAjudas}
                onChange={(e) => setNum('distanciaMinKmAjudas', e.target.value, true)}
              />
              <p className="text-xs text-muted-foreground">
                Ajudas de custo só aplicáveis com distância superior a este valor
              </p>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Derived rates display */}
      <DerivedRates config={config} />

      <Button onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Guardar configuração
      </Button>
    </div>
  )
}
