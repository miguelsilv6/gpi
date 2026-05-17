#!/usr/bin/env bash
# Atualiza a instalação local de GPI (git pull + rebuild + restart).
# Dados (BD + backups) são preservados — só código e imagens são tocados.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ ! -d .git ]; then
  echo "Este diretório não é um repo git — abortar." >&2; exit 1
fi
if [ ! -f .env ]; then
  echo ".env em falta — corre primeiro o install.sh." >&2; exit 1
fi

if docker compose version >/dev/null 2>&1; then DC="docker compose"
else DC="docker-compose"; fi

echo "▸ git pull..."
git pull --ff-only

echo "▸ Rebuild + restart (mantém volumes)..."
$DC -f docker-compose.prod.yml up -d --build

echo "✓ Update completo."
