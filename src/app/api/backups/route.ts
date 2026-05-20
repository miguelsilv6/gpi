import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { runBackup } from '@/lib/cron'
import { BACKUP_DIR, backupKind } from '@/lib/backups'
import type { Role } from '@/generated/prisma/enums'

interface BackupRow {
  filename: string
  size: number
  createdAt: string
  kind: 'auto' | 'manual' | 'prerestore'
}

export async function GET() {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão para gerir backups', 403)
    }

    let files: string[]
    try {
      files = await fs.readdir(BACKUP_DIR)
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT') {
        return Response.json({ files: [] })
      }
      throw err
    }

    const rows: BackupRow[] = []
    for (const filename of files) {
      if (!/^gpi_(backup|prerestore)_\d{8}_\d{6}\.sql\.gz$/.test(filename)) continue
      try {
        const stat = await fs.stat(path.join(BACKUP_DIR, filename))
        rows.push({
          filename,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
          kind: backupKind(filename),
        })
      } catch {
        // file may have been removed between readdir and stat — skip silently
      }
    }
    // Mais recentes primeiro
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return Response.json({ files: rows })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão para gerir backups', 403)
    }

    const start = Date.now()
    try {
      const filename = await runBackup({
        source: 'manual',
        utilizadorId: session.user.id,
      })
      // O size pode ser útil para o toast
      let size = 0
      try {
        const stat = await fs.stat(path.join(BACKUP_DIR, filename))
        size = stat.size
      } catch {
        // ignore
      }
      return Response.json({
        filename,
        size,
        durationMs: Date.now() - start,
      })
    } catch (err) {
      // runBackup já fez audit + notify. Aqui apenas devolvemos o erro ao cliente.
      // Exit code 75 do script = lock contended.
      const msg = err instanceof Error ? err.message : 'erro desconhecido'
      const isLock = /exit 75/i.test(msg)
      return apiError(
        isLock
          ? 'Outro backup ou restauro está em curso — tente em breve.'
          : `Falha ao criar backup: ${msg}`,
        isLock ? 409 : 500,
      )
    }
    void req
  } catch (error) {
    return handleApiError(error)
  }
}
