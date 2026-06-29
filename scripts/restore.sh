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

# psql/libpq não aceita parâmetros específicos do Prisma (e.g. ?schema=X).
# sed -E: remove cada param preservando o delimitador anterior (?/&) para que
# parâmetros libpq válidos a seguir (e.g. sslmode=require) não fiquem órfãos.
PG_URL="$(printf '%s\n' "${DATABASE_URL:-}" | sed -E 's/([?&])(schema|connection_limit|pool_timeout)=[^&]*&?/\1/g; s/\?&/?/g; s/[?&]$//')"

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
if ! gunzip -c "$BACKUP_FILE" | psql -1 -v ON_ERROR_STOP=1 "$PG_URL"; then
  echo "[restore] psql falhou — transação cancelada, BD inalterada." >&2
  exit 1
fi

# ── Anexos ────────────────────────────────────────────────────────────────────
# Se existir um arquivo companion de anexos (mesmo nome base, .files.tar.gz),
# restaura-o para DOCUMENTOS_DIR. A BD já foi confirmada; uma falha aqui é
# avisada mas não reverte o restauro da BD.
FILES_FILE="${BACKUP_FILE%.sql.gz}.files.tar.gz"
if [ -f "$FILES_FILE" ] && [ -n "${DOCUMENTOS_DIR:-}" ]; then
  if gzip -t "$FILES_FILE" 2>/dev/null; then
    echo "[restore] A restaurar anexos de: $FILES_FILE"
    mkdir -p "$DOCUMENTOS_DIR"
    if ! tar -xzf "$FILES_FILE" -C "$DOCUMENTOS_DIR"; then
      echo "[restore] AVISO: extração de anexos falhou — BD restaurada na mesma." >&2
    fi
  else
    echo "[restore] AVISO: arquivo de anexos corrompido, ignorado: $FILES_FILE" >&2
  fi
fi

echo "[restore] OK."
