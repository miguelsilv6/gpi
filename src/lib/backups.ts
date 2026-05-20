/**
 * Helpers partilhados pelas rotas de /api/backups/*.
 * Centraliza o caminho de armazenamento e a validação de filenames para
 * evitar bugs de path traversal.
 */
import path from 'node:path'

export const BACKUP_DIR =
  process.env.BACKUP_DIR ?? '/app/backups'

/** Regex estrita: prefixo conhecido + timestamp + .sql.gz. */
const FILENAME_REGEX = /^gpi_(backup|prerestore)_\d{8}_\d{6}\.sql\.gz$/

/**
 * Valida e resolve um filename recebido do cliente. Retorna o path absoluto
 * dentro de BACKUP_DIR se válido, ou `null` se houver qualquer suspeita de
 * path traversal / nome inválido.
 *
 * Triple-belt:
 *  - `path.basename` igual ao input (rejeita "../" e similares)
 *  - regex match
 *  - path.resolve dentro de BACKUP_DIR
 */
export function resolveBackupPath(filename: string): string | null {
  if (typeof filename !== 'string' || filename.length === 0) return null
  if (path.basename(filename) !== filename) return null
  if (!FILENAME_REGEX.test(filename)) return null
  const resolved = path.resolve(BACKUP_DIR, filename)
  if (!resolved.startsWith(path.resolve(BACKUP_DIR) + path.sep)) return null
  return resolved
}

/** Discriminador do tipo de backup pelo prefixo do filename. */
export function backupKind(filename: string): 'auto' | 'manual' | 'prerestore' {
  if (filename.startsWith('gpi_prerestore_')) return 'prerestore'
  // Não conseguimos distinguir auto/manual a partir do filename — o audit log
  // tem essa informação. Para o UI usamos 'backup' como genérico.
  return 'manual'
}
