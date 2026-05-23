#!/bin/sh
# Entrypoint for the GPI app container.
# Brings the database schema in sync via prisma migrate deploy, runs the
# idempotent seed and starts Next.js. Safe to run on every container start.
#
# Importante: usamos `prisma migrate deploy` (não `prisma db push`) para
# que o caminho de auto-atualização nunca apague colunas em schema drift.
# Mudanças de schema TÊM de ser submetidas como ficheiros de migração
# (`npx prisma migrate dev --name xxx`).

set -e

# Baseline guard: instalações criadas com o entrypoint antigo (`prisma db
# push`) não têm tabela `_prisma_migrations` e o `migrate deploy` recusava-se
# a correr. Marcamos as migrações existentes como aplicadas para baseline,
# uma única vez. PSQL_URL deriva de DATABASE_URL adicionando sslmode=disable
# implícito (a connection string já o tem se necessário).
if [ -n "${DATABASE_URL:-}" ]; then
  if ! psql "$DATABASE_URL" -tAc "SELECT to_regclass('_prisma_migrations')" 2>/dev/null | grep -q _prisma_migrations; then
    # Só faz sentido fazer baseline se já existirem tabelas — BD vazia segue
    # diretamente para o migrate deploy.
    if psql "$DATABASE_URL" -tAc "SELECT to_regclass('\"Utilizador\"')" 2>/dev/null | grep -q Utilizador; then
      echo "[entrypoint] Baseline: a marcar migrações existentes como aplicadas..."
      npx prisma migrate resolve --applied 20260514222943_init || true
      npx prisma migrate resolve --applied 20260515182438_add_composite_indexes || true
    fi
  fi
fi

echo "[entrypoint] Aplicando migrações (prisma migrate deploy)..."
npx prisma migrate deploy

echo "[entrypoint] Backfill natureza -> crime (idempotente)..."
npx tsx scripts/migrate-natureza-to-crime.ts || echo "[entrypoint] Aviso: backfill natureza falhou (continuando)"

echo "[entrypoint] A executar seed (upserts, idempotente)..."
# Seed never crashes the boot; we log and continue if it fails so the app
# stays available even if seed has a transient issue.
npx tsx prisma/seed.ts || echo "[entrypoint] Aviso: seed falhou (continuando)"

echo "[entrypoint] A arrancar Next.js em http://0.0.0.0:${PORT:-3000}"
exec node server.js
