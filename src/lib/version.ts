import pkg from '../../package.json'

export const APP_VERSION = pkg.version

/**
 * Git SHA injetado em build time via `--build-arg GIT_SHA=$(git rev-parse HEAD)`
 * e exposto pelo Dockerfile como `ENV GIT_SHA=$GIT_SHA`. Em dev sem build-arg
 * fica 'dev', o que o orquestrador trata como sentinel.
 */
export const APP_GIT_SHA = process.env.GIT_SHA ?? 'dev'

export const APP_GIT_SHA_SHORT = APP_GIT_SHA === 'dev' ? 'dev' : APP_GIT_SHA.slice(0, 7)
