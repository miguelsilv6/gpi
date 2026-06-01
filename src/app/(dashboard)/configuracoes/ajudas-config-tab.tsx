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
  ajudaCustoMaxDiario: number
  senhaAlmoco: number
  senhaJantar: number
  senhaCeia: number
  taxaIRS: number
  taxaSS: number
  distanciaMinKmAjudas: number
}

function fmtEur(n: number) {
  return `€${n.toFixed(4)}`
}

function DerivedRates({ config }: { config: AjudasConfig }) {
  const taxaSemanaDia = (config.vencimentoBase * config.percentPiqueteSemana) / 12
  const taxaSemanaNoite = taxaSemanaDia * 2
  const taxaFdsDia = (config.vencimentoBase * config.percentPiqueteFds) / 12
  const taxaFdsNoite = taxaFdsDia * 2
  const taxaPiqueteSemana = config.vencimentoBase * config.percentPiqueteSemana
  const taxaPiqueteFds = config.vencimentoBase * config.percentPiqueteFds

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Taxas Calculadas (leitura)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="flex justify-between py-1 border-b">
            <span className="text-muted-foreground">Semana 08-24h</span>
            <span className="font-medium">{fmtEur(taxaSemanaDia)}/h</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span className="text-muted-foreground">Semana 00-08h</span>
            <span className="font-medium">{fmtEur(taxaSemanaNoite)}/h</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span className="text-muted-foreground">FdS/Feriado 08-24h</span>
            <span className="font-medium">{fmtEur(taxaFdsDia)}/h</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span className="text-muted-foreground">FdS/Feriado 00-08h</span>
            <span className="font-medium">{fmtEur(taxaFdsNoite)}/h</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span className="text-muted-foreground">Piquete Semana</span>
            <span className="font-medium">{fmtEur(taxaPiqueteSemana)}/período</span>
          </div>
          <div className="flex justify-between py-1 border-b">
            <span className="text-muted-foreground">Piquete FdS</span>
            <span className="font-medium">{fmtEur(taxaPiqueteFds)}/período</span>
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
              <Label htmlFor="percentPiqueteSemana">Piquete Semana (ex: 0.083)</Label>
              <Input
                id="percentPiqueteSemana"
                type="number"
                step="0.001"
                min={0}
                max={1}
                value={config.percentPiqueteSemana}
                onChange={(e) => setNum('percentPiqueteSemana', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="percentPiqueteFds">Piquete FdS (ex: 0.105)</Label>
              <Input
                id="percentPiqueteFds"
                type="number"
                step="0.001"
                min={0}
                max={1}
                value={config.percentPiqueteFds}
                onChange={(e) => setNum('percentPiqueteFds', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="percentPrevencaoPassiva">Prevenção Passiva (ex: 0.4)</Label>
              <Input
                id="percentPrevencaoPassiva"
                type="number"
                step="0.001"
                min={0}
                max={1}
                value={config.percentPrevencaoPassiva}
                onChange={(e) => setNum('percentPrevencaoPassiva', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taxaIRS">Taxa IRS (ex: 0.1116)</Label>
              <Input
                id="taxaIRS"
                type="number"
                step="0.0001"
                min={0}
                max={1}
                value={config.taxaIRS}
                onChange={(e) => setNum('taxaIRS', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taxaSS">Taxa SS (ex: 0.11)</Label>
              <Input
                id="taxaSS"
                type="number"
                step="0.001"
                min={0}
                max={1}
                value={config.taxaSS}
                onChange={(e) => setNum('taxaSS', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Ajudas de Custo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajudas de Custo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ajudaCustoMaxDiario">Máximo Diário (€)</Label>
              <Input
                id="ajudaCustoMaxDiario"
                type="number"
                step="0.01"
                value={config.ajudaCustoMaxDiario}
                onChange={(e) => setNum('ajudaCustoMaxDiario', e.target.value)}
              />
            </div>
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

        {/* Senhas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Senhas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="senhaAlmoco">Senha Almoço (€)</Label>
              <Input
                id="senhaAlmoco"
                type="number"
                step="0.01"
                value={config.senhaAlmoco}
                onChange={(e) => setNum('senhaAlmoco', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senhaJantar">Senha Jantar (€)</Label>
              <Input
                id="senhaJantar"
                type="number"
                step="0.01"
                value={config.senhaJantar}
                onChange={(e) => setNum('senhaJantar', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senhaCeia">Senha Ceia (€)</Label>
              <Input
                id="senhaCeia"
                type="number"
                step="0.01"
                value={config.senhaCeia}
                onChange={(e) => setNum('senhaCeia', e.target.value)}
              />
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
