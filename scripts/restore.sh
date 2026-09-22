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

# Reset total do schema `public` antes de aplicar o dump. Necessário para
# restaurar backups de OUTRAS instalações GPI (versão de schema diferente):
# os DROP TABLE/DROP CONSTRAINT do dump são calculados a partir do schema da
# ORIGEM, não do alvo — se o alvo tiver colunas/tabelas mais recentes que
# dependem de um objeto que o dump tenta largar (ex. uma FK nova que
# referencia uma PK antiga), o DROP falha porque não sabe dessa dependência.
# Recriar o schema do zero elimina essa classe de conflito por completo: o
# dump deixa de precisar de "limpar" nada, só de construir a partir do nada.
#
# -1 / --single-transaction: tudo — incluindo o DROP/CREATE SCHEMA — dentro
# de BEGIN/COMMIT, falha atómica. Se o dump falhar a meio, o schema
# reconstruído nunca é confirmado e a BD fica exactamente como estava.
# -v ON_ERROR_STOP=1: aborta na primeira instrução SQL com erro.
if ! { echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION CURRENT_USER;'; \
       gunzip -c "$BACKUP_FILE"; } | psql -1 -v ON_ERROR_STOP=1 "$PG_URL"; then
  echo "[restore] psql falhou — transação cancelada, BD inalterada." >&2
  exit 1
fi

# O dump pode ser de uma versão mais antiga do GPI (schema sem as migrações
# mais recentes). Reaplica-as agora para trazer o schema à versão actual
# desta instalação, preservando os dados acabados de restaurar — a mesma
# chamada que o entrypoint da app corre no arranque. Não-fatal: o restauro
# da BD já está confirmado; um schema desatualizado só é resolvido no
# próximo arranque normal da app/worker se isto falhar aqui.
if [ -n "${DATABASE_URL:-}" ]; then
  echo "[restore] A atualizar o schema para a versão atual (prisma migrate deploy)..."
  npx prisma migrate deploy \
    || echo "[restore] AVISO: prisma migrate deploy falhou — reinicia app/worker para tentar de novo." >&2
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
