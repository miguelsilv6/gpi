import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { notifyBackupFailed } from '@/lib/notifications'
import { runBackup } from '@/lib/cron'
import { resolveBackupPath } from '@/lib/backups'
import type { Role } from '@/generated/prisma/enums'

const RESTORE_SCRIPT = 'scripts/restore.sh'

const bodySchema = z.object({
  confirm: z.literal('RESTAURAR', { message: 'Confirme escrevendo "RESTAURAR"' }),
})

/**
 * Restauro destrutivo. Sequência:
 *   1. Activar maintenance mode (UI/API bloqueiam não-admin).
 *   2. Snapshot de segurança pre-restauro.
 *   3. Terminar ligações Postgres existentes (libera locks).
 *   4. psql -1 -v ON_ERROR_STOP=1 (transação única, falha atómica).
 *   5. Desligar maintenance — `finally`, mesmo em erro.
 *   6. Audit + (em falha) notificação a ADMINISTRACAO.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  let maintenanceActivated = false
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão para restaurar backups', 403)
    }

    const body = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return apiError(parsed.error.issues[0].message, 400)

    const { filename } = await params
    const filePath = resolveBackupPath(filename)
    if (!filePath) return apiError('Filename inválido', 400)
    try {
      await fs.access(filePath)
    } catch {
      return apiError('Backup não encontrado', 404)
    }

    const startedAt = Date.now()

    // ── 1. Maintenance mode ON ────────────────────────────────────────────
    await prisma.configuracaoSistema.upsert({
      where: { id: 'singleton' },
      update: { maintenanceMode: true },
      create: { id: 'singleton', maintenanceMode: true },
    })
    maintenanceActivated = true

    // ── 2. Snapshot pre-restauro ──────────────────────────────────────────
    // Retenção curta (5) para não despejar backups normais.
    let prerestoreFilename = ''
    try {
      prerestoreFilename = await runBackup({
        source: 'pre_restauro',
        prefix: 'gpi_prerestore_',
        retention: 5,
        utilizadorId: session.user.id,
      })
    } catch (err) {
      // Se nem o snapshot consegue ser tirado, abortar — restauro sem
      // safety net é irrecuperável.
      throw new Error(
        `Pre-restauro falhou: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // ── 3. Terminar ligações de outras sessões ────────────────────────────
    // Reduz a hipótese de o psql ficar à espera de locks.
    await prisma.$executeRawUnsafe(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()",
    )

    // ── 4. Restore ────────────────────────────────────────────────────────
    const result = spawnSync('bash', [RESTORE_SCRIPT, filePath], {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? '' },
      encoding: 'utf8',
    })

    if (result.status !== 0) {
      const stderr = result.stderr || result.stdout || 'erro desconhecido'
      // Audit + notify, depois rethrow para cair no finally
      try {
        await prisma.auditLog.create({
          data: {
            acao: 'RESTORE_FAILED',
            entidade: 'Sistema',
            entidadeId: filename,
            utilizadorId: session.user.id,
            detalhes: {
              filename,
              prerestoreFilename,
              exitCode: result.status,
              durationMs: Date.now() - startedAt,
              stderr: stderr.slice(0, 2000),
            } as never,
          },
        })
      } catch {}
      try {
        await notifyBackupFailed({ contexto: 'restauro', error: stderr })
      } catch {}
      return apiError(
        `Falha no restauro: ${stderr.slice(0, 200)}. Pre-snapshot disponível: ${prerestoreFilename}`,
        500,
      )
    }

    // ── 5/6. Sucesso → audit ──────────────────────────────────────────────
    await prisma.auditLog.create({
      data: {
        acao: 'RESTORE_BACKUP',
        entidade: 'Sistema',
        entidadeId: filename,
        utilizadorId: session.user.id,
        detalhes: {
          filename,
          prerestoreFilename,
          durationMs: Date.now() - startedAt,
        } as never,
      },
    })

    return Response.json({
      filename,
      prerestoreFilename,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    return handleApiError(error)
  } finally {
    // Garante que o sistema não fica preso em manutenção em caso de crash.
    if (maintenanceActivated) {
      try {
        await prisma.configuracaoSistema.update({
          where: { id: 'singleton' },
          data: { maintenanceMode: false },
        })
      } catch {
        // último recurso — admin pode desligar manualmente em /configurações
      }
    }
  }
}
