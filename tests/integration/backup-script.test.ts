import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getTestPrisma, resetDatabase, disconnectTestPrisma } from '../helpers/db'
import { scenarioTwoBrigadas } from '../helpers/fixtures'

/**
 * Testes script-level do `scripts/backup.sh`.
 *
 * Requer `pg_dump` instalado no PATH (já vem no contentor de runtime; em CI o
 * job usa `apt-get install postgresql-client-16`).
 *
 * Os testes correm contra o test DB e escrevem para um diretório temporário
 * — isolado do `/backups` da app real.
 */

const prisma = getTestPrisma()
const BACKUP_SCRIPT = join(process.cwd(), 'scripts', 'backup.sh')

// pg_dump (cliente Postgres) não aceita ?schema=X — Prisma adiciona mas o
// driver Postgres puro rejeita-o como query param inválido. Stripping aqui
// dá-nos uma URL "Postgres pura" para o script.
function pgDumpUrl(): string {
  const url = process.env.DATABASE_URL ?? ''
  return url.replace(/[?&]schema=[^&]*/g, '')
}

let backupDir: string

function hasPgDump(): boolean {
  const r = spawnSync('which', ['pg_dump'])
  return r.status === 0
}

const hasTools = hasPgDump()

beforeAll(() => {
  if (!hasTools) {
    console.warn(
      '[backup-script tests] pg_dump não encontrado no PATH — testes skipped.',
    )
  }
})

beforeEach(async () => {
  await resetDatabase(prisma)
  backupDir = mkdtempSync(join(tmpdir(), 'gpi-backup-test-'))
})

afterAll(async () => {
  await disconnectTestPrisma()
})

describe('scripts/backup.sh', () => {
  test.skipIf(!hasTools)('produz um dump .sql.gz íntegro', async () => {
    await scenarioTwoBrigadas(prisma)

    const out = execFileSync('bash', [BACKUP_SCRIPT], {
      env: {
        ...process.env,
        DATABASE_URL: pgDumpUrl(),
        BACKUP_DIR: backupDir,
        BACKUP_PREFIX: 'gpi_test_',
      },
      encoding: 'utf-8',
    })

    // Última linha do stdout é o filename (contrato do script).
    const filename = out.trim().split('\n').pop()!
    expect(filename).toMatch(/^gpi_test_\d{8}_\d{6}\.sql\.gz$/)

    const filePath = join(backupDir, filename)
    expect(existsSync(filePath)).toBe(true)

    // Integridade: gunzip -t deve passar (já é parte do script, mas
    // re-verificamos para evitar regressão).
    const gunzip = spawnSync('gunzip', ['-t', filePath])
    expect(gunzip.status).toBe(0)

    // Ficheiro > 0 bytes
    const stats = statSync(filePath)
    expect(stats.size).toBeGreaterThan(100)

    // Permissões world-readable (umask 0022 → 644).
    // mode & 0o777 deve ser 0o644.
    expect(stats.mode & 0o777).toBe(0o644)
  })

  test.skipIf(!hasTools)('retenção mantém apenas N ficheiros mais recentes do prefixo', async () => {
    await scenarioTwoBrigadas(prisma)

    // Cria 3 backups com retenção=2 → o mais antigo deve ser apagado.
    for (let i = 0; i < 3; i++) {
      execFileSync('bash', [BACKUP_SCRIPT], {
        env: {
          ...process.env,
          DATABASE_URL: pgDumpUrl(),
          BACKUP_DIR: backupDir,
          BACKUP_PREFIX: 'gpi_test_',
          BACKUP_RETENTION: '2',
        },
        encoding: 'utf-8',
      })
      // Esperar 1s entre dumps para garantir TIMESTAMP único (granularidade
      // por segundo).
      await new Promise((r) => setTimeout(r, 1100))
    }

    const files = readdirSync(backupDir).filter((f) => f.startsWith('gpi_test_'))
    expect(files.length).toBe(2)
  })

  test.skipIf(!hasTools)(
    'prefixos diferentes têm caps separados (auto vs prerestore)',
    async () => {
      await scenarioTwoBrigadas(prisma)

      // 2 backups "auto"
      for (let i = 0; i < 2; i++) {
        execFileSync('bash', [BACKUP_SCRIPT], {
          env: {
            ...process.env,
            DATABASE_URL: pgDumpUrl(),
            BACKUP_DIR: backupDir,
            BACKUP_PREFIX: 'gpi_auto_',
            BACKUP_RETENTION: '5',
          },
          encoding: 'utf-8',
        })
        await new Promise((r) => setTimeout(r, 1100))
      }

      // 1 backup "prerestore"
      execFileSync('bash', [BACKUP_SCRIPT], {
        env: {
          ...process.env,
          DATABASE_URL: pgDumpUrl(),
          BACKUP_DIR: backupDir,
          BACKUP_PREFIX: 'gpi_prerestore_',
          BACKUP_RETENTION: '5',
        },
        encoding: 'utf-8',
      })

      const all = readdirSync(backupDir)
      expect(all.filter((f) => f.startsWith('gpi_auto_'))).toHaveLength(2)
      expect(all.filter((f) => f.startsWith('gpi_prerestore_'))).toHaveLength(1)
    },
  )

  test.skipIf(!hasTools)('falha quando DATABASE_URL é inválido', () => {
    const r = spawnSync('bash', [BACKUP_SCRIPT], {
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://nope:nope@localhost:9999/notexist',
        BACKUP_DIR: backupDir,
        BACKUP_PREFIX: 'gpi_failtest_',
      },
      encoding: 'utf-8',
    })

    expect(r.status).not.toBe(0)
    // Não deve deixar ficheiros parciais.
    const files = readdirSync(backupDir).filter((f) => f.startsWith('gpi_failtest_'))
    expect(files).toHaveLength(0)
  })
})
