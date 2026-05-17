#!/bin/sh
# Entrypoint for the GPI app container.
# Brings the database schema in sync and runs the seed before starting Next.js.
# Idempotent: safe to run on every container start.

set -e

echo "[entrypoint] Aplicando schema (prisma db push)..."
npx prisma db push --accept-data-loss --skip-generate

echo "[entrypoint] A executar seed (upserts, idempotente)..."
# Seed never crashes the boot; we log and continue if it fails so the app
# stays available even if seed has a transient issue.
npx tsx prisma/seed.ts || echo "[entrypoint] Aviso: seed falhou (continuando)"

echo "[entrypoint] A arrancar Next.js em http://0.0.0.0:${PORT:-3000}"
exec node server.js
