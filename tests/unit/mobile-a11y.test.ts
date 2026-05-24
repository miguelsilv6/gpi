/**
 * Testes de regressão para mobile a11y.
 *
 * Ver `/root/.claude/plans/quero-que-projetes-uma-eager-papert.md` (Fase 2)
 * para o contexto da auditoria que originou estas regras.
 *
 * Não tenta cobrir tudo — guarda apenas os anti-patterns concretos que
 * foram identificados no audit e que reaparecem facilmente quando se
 * copia/cola código antigo. Para 44×44 tap targets, usar `iconButtonClasses`
 * de `@/lib/utils` ou as variantes `icon-*` de `<Button>` (todas já
 * incluem `[@media(pointer:coarse)]:min-h-11`).
 */
import { describe, test, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '../../src')

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walk(p)))
    } else if (p.endsWith('.tsx') || p.endsWith('.ts')) {
      out.push(p)
    }
  }
  return out
}

describe('mobile-a11y regressions', () => {
  test('p-1.5 rounded hover:bg-... icon-button anti-pattern não reaparece', async () => {
    // Tap area de ~20px — abaixo do mínimo WCAG 2.5.5 e iOS HIG (44px).
    // Substituir por `iconButtonClasses` ou <Button size="icon-table" />.
    const files = await walk(SRC)
    const offenders: string[] = []
    const re = /className="[^"]*\bp-1\.5\s+rounded\s+hover:bg-(muted|accent)/
    for (const f of files) {
      const txt = await fs.readFile(f, 'utf8')
      if (re.test(txt)) offenders.push(path.relative(SRC, f))
    }
    expect(offenders).toEqual([])
  })

  test('viewport meta não bloqueia zoom (sem maximumScale)', async () => {
    // WCAG 2.1 / 1.4.4 — utilizadores com baixa visão têm de poder fazer
    // zoom até pelo menos 200%. Definir maximumScale: 1 ou user-scalable=no
    // impede-os.
    const layoutTxt = await fs.readFile(path.join(SRC, 'app/layout.tsx'), 'utf8')
    expect(layoutTxt).not.toMatch(/maximumScale\s*:\s*[12]/)
    expect(layoutTxt).not.toMatch(/userScalable\s*:\s*false/)
  })
})
