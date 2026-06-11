'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ArrowRightLeft, ShieldOff } from 'lucide-react'
import { CopyButton } from './toolbox-shared'

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
