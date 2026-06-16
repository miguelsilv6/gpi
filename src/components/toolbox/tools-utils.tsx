'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ArrowRightLeft, ShieldOff, CheckCircle2, XCircle, Smartphone } from 'lucide-react'
import { CopyButton, ResultRow } from './toolbox-shared'

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

/**
 * Dígito de controlo (Luhn) de um IMEI, calculado a partir dos 14 primeiros
 * dígitos. Da direita para a esquerda, duplica-se cada dígito em posição par
 * (o mais à direita inclusive); se o produto exceder 9 subtrai-se 9. O dígito
 * de controlo é (10 - soma mod 10) mod 10. Mesma lógica da folha de cálculo
 * original (soma Luhn → dígito final).
 */
function imeiCheckDigit(digits14: string): number {
  let sum = 0
  for (let i = 0; i < 14; i++) {
    let d = digits14.charCodeAt(13 - i) - 48
    if (i % 2 === 0) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return (10 - (sum % 10)) % 10
}

export function ImeiTool() {
  const [input, setInput] = useState('')
  const digits = input.replace(/\D/g, '')

  let resultado: React.ReactNode = null
  if (digits.length === 14) {
    const cd = imeiCheckDigit(digits)
    const completo = digits + cd
    resultado = (
      <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
        <ResultRow label="Dígito de controlo" value={<span className="text-lg font-bold">{cd}</span>} />
        <ResultRow
          label="IMEI completo"
          value={
            <span className="flex items-center gap-2">
              {completo}
              <CopyButton text={completo} />
            </span>
          }
        />
      </div>
    )
  } else if (digits.length === 15) {
    const cd = imeiCheckDigit(digits.slice(0, 14))
    const fornecido = digits.charCodeAt(14) - 48
    const valido = cd === fornecido
    resultado = (
      <div
        className={
          'rounded-lg border p-3 space-y-1 ' +
          (valido
            ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20'
            : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20')
        }
      >
        <p
          className={
            'flex items-center gap-1.5 text-sm font-medium ' +
            (valido ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300')
          }
        >
          {valido ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {valido ? 'IMEI válido' : 'IMEI inválido — dígito de controlo incorreto'}
        </p>
        <ResultRow label="Dígito fornecido" value={fornecido} />
        <ResultRow label="Dígito correto" value={<span className="font-bold">{cd}</span>} />
      </div>
    )
  } else if (digits.length > 0) {
    resultado = (
      <p className="text-xs text-red-600 dark:text-red-400">
        Introduza 14 dígitos (para calcular o dígito de controlo) ou 15 (para validar). Tem {digits.length}.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tb-imei-in">IMEI (14 ou 15 dígitos)</Label>
        <Input
          id="tb-imei-in"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          inputMode="numeric"
          placeholder="35014720445222"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          14 dígitos: calcula o 15.º dígito de controlo (Luhn). 15 dígitos: valida o IMEI completo.
          Espaços, traços e barras são ignorados.
        </p>
      </div>
      {resultado}
    </div>
  )
}
