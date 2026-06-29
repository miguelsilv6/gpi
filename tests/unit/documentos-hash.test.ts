import { describe, test, expect, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256Hex, sha256OfFile } from '@/lib/documentos'

/**
 * Integridade de anexos: SHA-256 do conteúdo (upload) e do ficheiro em disco
 * (verificação) têm de coincidir; conteúdo diferente produz hash diferente.
 */

const dir = mkdtempSync(join(tmpdir(), 'gpi-hash-'))

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('sha256Hex / sha256OfFile', () => {
  test('vetor conhecido para "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  test('buffer e string com o mesmo conteúdo dão o mesmo hash', () => {
    expect(sha256Hex(Buffer.from('conteúdo de prova'))).toBe(sha256Hex('conteúdo de prova'))
  })

  test('o hash do ficheiro em disco coincide com o do conteúdo (íntegro)', async () => {
    const conteudo = Buffer.from('prova digital — relatório pericial')
    const p = join(dir, 'prova.bin')
    await fs.writeFile(p, conteudo)
    expect(await sha256OfFile(p)).toBe(sha256Hex(conteudo))
  })

  test('alterar o ficheiro muda o hash (deteção de adulteração)', async () => {
    const p = join(dir, 'mut.bin')
    await fs.writeFile(p, 'original')
    const antes = await sha256OfFile(p)
    await fs.writeFile(p, 'adulterado')
    const depois = await sha256OfFile(p)
    expect(depois).not.toBe(antes)
    expect(antes).toBe(sha256Hex('original'))
  })
})
