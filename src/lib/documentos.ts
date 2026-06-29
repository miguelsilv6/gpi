import path from 'node:path'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/** SHA-256 (hex) de um buffer ou string. Usado no upload de documentos. */
export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

/** SHA-256 (hex) de um ficheiro em disco, por streaming (memória constante). */
export function sha256OfFile(absPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(absPath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

// Diretório em disco onde vivem os anexos dos inquéritos. Em produção é um
// bind mount (tal como BACKUP_DIR); em dev cai numa pasta local.
export const DOCUMENTOS_DIR = process.env.DOCUMENTOS_DIR ?? '/app/documentos'

export const DOCUMENTO_MAX_BYTES = 25 * 1024 * 1024 // 25 MB

// Allowlist de MIME types aceites — documentos e provas habituais de um
// inquérito. Tipos executáveis/scripts ficam de fora por princípio.
export const DOCUMENTO_MIME_ALLOWLIST: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-7z-compressed',
  'message/rfc822',
  'application/vnd.ms-outlook',
])

/** Caminho absoluto em disco para um documento guardado. */
export function documentoPath(storedName: string): string {
  // storedName é gerado por nós (cuid + extensão), mas valida na mesma para
  // garantir que nunca sai do diretório (defesa em profundidade).
  const resolved = path.resolve(DOCUMENTOS_DIR, storedName)
  if (!resolved.startsWith(path.resolve(DOCUMENTOS_DIR) + path.sep)) {
    throw new Error('Nome de ficheiro inválido', { cause: 400 })
  }
  return resolved
}

/** Limpa o nome original: remove paths e caracteres de controlo, limita tamanho. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'ficheiro'
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\x00-\x1f\x7f]/g, '').trim()
  return (cleaned || 'ficheiro').slice(0, 200)
}
