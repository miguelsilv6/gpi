import pino, { type Logger } from 'pino'

/**
 * Logger estruturado (pino).
 *
 * Em produção emite JSON line-per-line (stdout) — fácil de ingerir por
 * jornal/loki/cloudwatch. Em desenvolvimento usa pino-pretty para legibilidade.
 *
 * O audit log (BD) continua a ser a fonte canónica para eventos de negócio
 * — este logger serve para diagnóstico operacional (cron, backup, falhas
 * inesperadas, etc.).
 *
 * Uso:
 *   import { logger } from '@/lib/logger'
 *   logger.info({ inqueritoId: 'x' }, 'Inquérito criado')
 *   logger.error({ err }, 'Falha a contactar SMTP')
 */

const isDev = process.env.NODE_ENV !== 'production'
const level = process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info')

export const logger: Logger = pino({
  level,
  // Em dev, transport pretty. Em prod, JSON puro.
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
  base: {
    // Em produção é útil distinguir entre app e worker no mesmo agregador.
    component: process.env.LOG_COMPONENT ?? 'app',
  },
  // PII safety: redacta campos comuns de password / token / email no caso
  // de ser logged por engano. Aplicado a qualquer profundidade.
  redact: {
    paths: ['*.password', '*.passwordHash', '*.token', '*.tokenHash', 'req.headers.authorization'],
    censor: '[REDACTED]',
  },
})

/** Logger filho com contexto fixo — útil em scopes longos. */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings)
}
