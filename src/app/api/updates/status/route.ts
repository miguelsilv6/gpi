import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { APP_VERSION, APP_GIT_SHA_SHORT } from '@/lib/version'
import { isNewerVersion } from '@/lib/updates/github'
import { isTerminal, type UpdateState } from '@/lib/updates/state-machine'
import type { Role } from '@/generated/prisma/enums'

/**
 * Devolve o estado atual do sistema de atualizações:
 *   - versão local / git sha
 *   - última versão conhecida (cached)
 *   - atualização em curso ou a mais recente terminada
 *
 * Chamado em polling pelo UI a cada 2s enquanto há um update em curso.
 */
export async function GET() {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão para gerir atualizações', 403)
    }

    const config = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
      select: {
        latestVersionTag: true,
        latestVersionCheckedAt: true,
        latestVersionUrl: true,
        latestVersionNotes: true,
        maintenanceMode: true,
      },
    })

    // Procura primeiro um update em curso; se não houver, devolve o último terminado.
    const inFlight = await prisma.atualizacaoSistema.findFirst({
      where: { finishedAt: null },
      orderBy: { startedAt: 'desc' },
      include: { iniciadoPor: { select: { id: true, nome: true } } },
    })
    const latest =
      inFlight ??
      (await prisma.atualizacaoSistema.findFirst({
        orderBy: { startedAt: 'desc' },
        include: { iniciadoPor: { select: { id: true, nome: true } } },
      }))

    const latestState = latest?.state as UpdateState | undefined
    const inProgress = latestState ? !isTerminal(latestState) : false

    return Response.json({
      currentVersion: APP_VERSION,
      currentSha: APP_GIT_SHA_SHORT,
      latestTag: config?.latestVersionTag ?? null,
      latestUrl: config?.latestVersionUrl ?? null,
      latestNotes: config?.latestVersionNotes ?? null,
      checkedAt: config?.latestVersionCheckedAt?.toISOString() ?? null,
      updateAvailable:
        !!config?.latestVersionTag &&
        isNewerVersion(config.latestVersionTag, APP_VERSION),
      maintenanceMode: config?.maintenanceMode ?? false,
      inProgress,
      current: latest
        ? {
            id: latest.id,
            requestId: latest.requestId,
            fromVersion: latest.fromVersion,
            toVersion: latest.toVersion,
            state: latest.state,
            preBackupFile: latest.preBackupFile,
            startedAt: latest.startedAt.toISOString(),
            finishedAt: latest.finishedAt?.toISOString() ?? null,
            errorMessage: latest.errorMessage,
            rolledBack: latest.rolledBack,
            iniciadoPor: latest.iniciadoPor.nome,
          }
        : null,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
