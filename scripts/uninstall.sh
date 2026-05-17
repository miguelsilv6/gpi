#!/usr/bin/env bash
# Desinstala GPI: para containers, remove volumes (com confirmação) e apaga o diretório.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$INSTALL_DIR"

if docker compose version >/dev/null 2>&1; then DC="docker compose"
else DC="docker-compose"; fi

echo "Vai desinstalar GPI em: $INSTALL_DIR"
echo

read -r -p "Apagar TAMBÉM os dados da base de dados (volumes)? [s/N]: " REMOVE_VOLUMES
read -r -p "Apagar o diretório $INSTALL_DIR? [s/N]: " REMOVE_DIR

if [ -f docker-compose.prod.yml ]; then
  echo "▸ A parar containers..."
  if [[ "$REMOVE_VOLUMES" =~ ^[sSyY]$ ]]; then
    $DC -f docker-compose.prod.yml down -v
    echo "✓ Containers + volumes removidos"
  else
    $DC -f docker-compose.prod.yml down
    echo "✓ Containers parados (volumes preservados)"
  fi
fi

if [[ "$REMOVE_DIR" =~ ^[sSyY]$ ]]; then
  cd ..
  rm -rf "$INSTALL_DIR"
  echo "✓ Diretório removido"
fi

echo "Desinstalação completa."
