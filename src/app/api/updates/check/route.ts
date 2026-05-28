import { getSession, handleApiError, apiError } from '@/lib/auth-helpers'
import { hasPermission } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { fetchLatestRelease, isNewerVersion } from '@/lib/updates/github'
import { APP_VERSION } from '@/lib/version'
import type { Role } from '@/generated/prisma/enums'

const CHECK_DEBOUNCE_MS = 60_000

/**
 * Força uma verificação à GitHub Releases agora. Debounce de 60s: chamadas
 * consecutivas servem o último valor cacheado para evitar exaustão do rate
 * limit unauthenticated do GitHub (60 req/h).
 */
export async function POST() {
  try {
    const session = await getSession()
    const role = session.user.role as Role
    if (!hasPermission(role, 'sistema:config')) {
      return apiError('Sem permissão para gerir atualizações', 403)
    }

    const config = await prisma.configuracaoSistema.findUnique({
      where: { id: 'singleton' },
    })

    const lastCheck = config?.latestVersionCheckedAt?.getTime() ?? 0
    const debounced = Date.now() - lastCheck < CHECK_DEBOUNCE_MS

    if (debounced) {
      return Response.json({
        currentVersion: APP_VERSION,
        latestTag: config?.latestVersionTag ?? null,
        latestUrl: config?.latestVersionUrl ?? null,
        latestNotes: config?.latestVersionNotes ?? null,
        checkedAt: config?.latestVersionCheckedAt?.toISOString() ?? null,
        updateAvailable:
          !!config?.latestVersionTag &&
          isNewerVersion(config.latestVersionTag, APP_VERSION),
        cached: true,
      })
    }

    const release = await fetchLatestRelease()

    if (release) {
      await prisma.configuracaoSistema.update({
        where: { id: 'singleton' },
        data: {
          latestVersionTag: release.tag,
          latestVersionUrl: release.url,
          latestVersionNotes: release.notes,
          latestVersionCheckedAt: new Date(),
        },
      })
    } else {
      // Atualiza só o timestamp (debounce continua a contar) mas mantém
      // o valor cacheado anterior.
      await prisma.configuracaoSistema.update({
        where: { id: 'singleton' },
        data: { latestVersionCheckedAt: new Date() },
      })
    }

    // If the GitHub latest is older than our running version, show the current
    // app version so the UI doesn't display a confusingly lower number.
    const rawTag = release?.tag ?? config?.latestVersionTag ?? null
    const latestTag =
      rawTag && !isNewerVersion(rawTag, APP_VERSION) ? APP_VERSION : rawTag

    return Response.json({
      currentVersion: APP_VERSION,
      latestTag,
      latestUrl: release?.url ?? config?.latestVersionUrl ?? null,
      latestNotes: release?.notes ?? config?.latestVersionNotes ?? null,
      checkedAt: new Date().toISOString(),
      updateAvailable: !!latestTag && isNewerVersion(latestTag, APP_VERSION),
      cached: false,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
