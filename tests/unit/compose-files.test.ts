import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Os docker-compose não podem ter chaves repetidas no mesmo bloco: o Docker
 * Compose recusa o ficheiro inteiro ("mapping key ... already defined") e a
 * stack deixa de arrancar. Verificação leve (sem dependência de YAML): dentro
 * de cada bloco de mapeamento, as chaves têm de ser únicas.
 */
function chavesDuplicadas(texto: string): string[] {
  const erros: string[] = []
  // pilha de { indent, chaves } — um mapeamento por nível de indentação.
  const pilha: { indent: number; chaves: Set<string> }[] = []
  texto.split('\n').forEach((linha, i) => {
    if (!linha.trim() || linha.trim().startsWith('#') || linha.trim().startsWith('- ')) return
    const m = /^(\s*)([A-Za-z0-9_.-]+):(\s|$)/.exec(linha)
    if (!m) return
    const indent = m[1].length
    while (pilha.length && pilha[pilha.length - 1].indent > indent) pilha.pop()
    let topo = pilha[pilha.length - 1]
    if (!topo || topo.indent < indent) {
      topo = { indent, chaves: new Set() }
      pilha.push(topo)
    }
    if (topo.chaves.has(m[2])) erros.push(`linha ${i + 1}: chave repetida "${m[2]}"`)
    topo.chaves.add(m[2])
  })
  return erros
}

describe('docker-compose', () => {
  test.each(['docker-compose.yml', 'docker-compose.prod.yml'])('%s não tem chaves repetidas', (f) => {
    const texto = readFileSync(join(process.cwd(), f), 'utf8')
    expect(chavesDuplicadas(texto)).toEqual([])
  })

  test('o detetor apanha uma chave repetida', () => {
    const mau = 'services:\n  app:\n    environment:\n      A: 1\n      B: 2\n      A: 3\n'
    expect(chavesDuplicadas(mau)).toEqual(['linha 6: chave repetida "A"'])
  })
})
