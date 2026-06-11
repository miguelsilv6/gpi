import { describe, test, expect } from 'vitest'
import { sanitizeFilename, documentoPath, DOCUMENTOS_DIR } from '@/lib/documentos'

describe('sanitizeFilename', () => {
  test('mantém nomes normais', () => {
    expect(sanitizeFilename('relatorio_final.pdf')).toBe('relatorio_final.pdf')
  })

  test('remove componentes de path (unix e windows)', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('C:\\Users\\x\\doc.pdf')).toBe('doc.pdf')
  })

  test('remove caracteres de controlo', () => {
    expect(sanitizeFilename('doc\x00umento\x1f.pdf')).toBe('documento.pdf')
  })

  test('nome vazio cai para "ficheiro"', () => {
    expect(sanitizeFilename('')).toBe('ficheiro')
    expect(sanitizeFilename('///')).toBe('ficheiro')
  })

  test('trunca nomes acima de 200 caracteres', () => {
    expect(sanitizeFilename('a'.repeat(300)).length).toBe(200)
  })
})

describe('documentoPath', () => {
  test('resolve dentro do diretório de documentos', () => {
    const p = documentoPath('abc-123.pdf')
    expect(p.startsWith(DOCUMENTOS_DIR)).toBe(true)
  })

  test('rejeita path traversal', () => {
    expect(() => documentoPath('../../../etc/passwd')).toThrow()
    expect(() => documentoPath('..')).toThrow()
  })
})
