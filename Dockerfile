FROM node:22-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Git SHA do build, exposto à app via process.env.GIT_SHA (src/lib/version.ts).
# Passado pelo `docker compose build --build-arg GIT_SHA=$(git rev-parse HEAD)`
# e fallback para 'dev' quando ausente (ambientes locais).
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/src/generated ./src/generated

# Pin postgresql-client major version to match the Postgres server (16).
# coreutils + util-linux are needed by scripts/backup.sh (df --output, flock).
# su-exec é usado pelo entrypoint para dropar privilégios depois de corrigir
# o ownership dos bind mounts.
RUN apk add --no-cache postgresql16-client bash coreutils util-linux su-exec

# NOTA: deliberadamente SEM `USER nextjs` aqui. O entrypoint arranca como
# root para fazer chown a /app/backups /app/control /app/branding (bind
# mounts vindos do host com uid arbitrário) e re-exec'a-se a si próprio
# como nextjs via su-exec antes de qualquer trabalho real.

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# The entrypoint applies the schema, seeds idempotently and then starts the
# server. This makes the container "plug and play" — no manual migrate step.
ENTRYPOINT ["sh", "/app/scripts/docker-entrypoint.sh"]
