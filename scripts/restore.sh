#!/bin/bash
# Restauro do GPI — aplica um dump comprimido sobre a BD actual.
#
# Variáveis de ambiente:
#   DATABASE_URL  (obrigatória)
#
# Argumentos:
#   $1            (obrigatório)  path absoluto do ficheiro .sql.gz a aplicar
#
# Saídas:
#   exit 0   → sucesso, transação confirmada
#   exit 1   → falha; toda a transação foi rolled back, BD inalterada
#   exit 75  → outro backup/restauro em curso (EX_TEMPFAIL)
set -euo pipefail

BACKUP_FILE="${1:-}"
LOCKFILE="/tmp/gpi-backup.lock"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.sql.gz>" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: file not found: $BACKUP_FILE" >&2
  exit 1
fi

# Integridade básica antes de tocar na BD.
if ! gunzip -t "$BACKUP_FILE" 2>/dev/null; then
  echo "Error: ficheiro corrompido (gunzip -t falhou): $BACKUP_FILE" >&2
  exit 1
fi

# Mesmo lockfile usado por backup.sh — restauros e backups não correm em
# paralelo.
exec 200>"$LOCKFILE"
if ! flock -n 200; then
  echo "[restore] Outro backup/restauro já está a correr — abortar." >&2
  exit 75
fi

echo "[restore] A restaurar de: $BACKUP_FILE"

# -1 / --single-transaction: tudo dentro de BEGIN/COMMIT, falha atómica.
# -v ON_ERROR_STOP=1: aborta na primeira instrução SQL com erro.
# Com --clean --if-exists no dump, podemos restaurar sobre uma BD existente
# sem mexer no schema.
if ! gunzip -c "$BACKUP_FILE" | psql -1 -v ON_ERROR_STOP=1 "$DATABASE_URL"; then
  echo "[restore] psql falhou — transação cancelada, BD inalterada." >&2
  exit 1
fi

echo "[restore] OK."
