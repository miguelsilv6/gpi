#!/bin/sh
# Worker entrypoint do GPI.
#
# Arranca como root para corrigir ownership de bind mounts (./backups,
# ./control, ./branding) — sem isto, o pg_dump escrito por uid 1001
# falhava com "Permission denied" quando o operador criou as pastas no
# host com outro uid. Depois dropa privilégios via su-exec.

set -e

# Garante que os mount points pertencem ao uid:gid do worker (1001:1001).
# `|| true` porque se a pasta não existir (dev local sem bind), tudo bem.
for dir in /app/backups /app/control /app/branding; do
  if [ -d "$dir" ]; then
    chown -R worker:nodejs "$dir" 2>/dev/null || true
  fi
done

# Dropa privilégios e arranca o worker.
exec su-exec worker:nodejs npx tsx worker.ts
