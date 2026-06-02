#!/bin/bash
# Backup do GPI — dump lógico do Postgres comprimido com gzip.
#
# Variáveis de ambiente:
#   DATABASE_URL          (obrigatória)    connection string Postgres
#   BACKUP_DIR            (default /backups)  destino dos ficheiros
#   BACKUP_PREFIX         (default gpi_backup_)  prefixo do filename;
#                                                 'gpi_prerestore_' para snapshots
#                                                 de pré-restauro
#   BACKUP_REMOTE_CMD     (opcional)       comando shell executado no fim;
#                                          {file} é substituído pelo path absoluto
#   BACKUP_RETENTION      (default 30)     número de ficheiros a manter por prefixo
#
# Saídas:
#   stdout: progress
#   exit 0  → sucesso; ficheiro existente e íntegro
#   exit 1  → falha em qualquer etapa; ficheiros parciais são removidos
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-gpi_backup_}"
BACKUP_RETENTION="${BACKUP_RETENTION:-30}"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
FILENAME="${BACKUP_PREFIX}${TIMESTAMP}.sql.gz"
FILE_PATH="${BACKUP_DIR}/${FILENAME}"
LOCKFILE="/tmp/gpi-backup.lock"

# pg_dump usa libpq e não aceita parâmetros específicos do Prisma como ?schema=X.
# sed -E: remove cada param preservando o delimitador anterior (?/&) para que
# parâmetros libpq válidos a seguir (e.g. sslmode=require) não fiquem órfãos.
PG_URL="$(printf '%s\n' "${DATABASE_URL:-}" | sed -E 's/([?&])(schema|connection_limit|pool_timeout)=[^&]*&?/\1/g; s/\?&/?/g; s/[?&]$//')"

# World-readable backups → o operador no host consegue copiar via `docker cp`
# independentemente do UID dentro do contentor.
umask 0022

mkdir -p "$BACKUP_DIR"

# `flock` evita corrida quando o cron dispara enquanto o operador também
# carrega "Criar backup agora" no UI. Sai com código != 0 se outro processo
# já tem o lock — o caller traduz para 429/409.
exec 200>"$LOCKFILE"
if ! flock -n 200; then
  echo "[backup] Outro backup/restauro já está a correr — abortar." >&2
  exit 75   # EX_TEMPFAIL
fi

echo "[backup] A iniciar: $FILENAME"

# ── Free-disk precheck ────────────────────────────────────────────────────────
# Heurística: precisar de pelo menos 2× o tamanho do último dump (ou 100 MB
# se for o primeiro). df --output=avail vem em blocos de 1024 bytes.
avail_kb="$(df --output=avail "$BACKUP_DIR" | tail -n 1 | tr -d ' ')"
last_size_kb=0
last_file="$(ls -1t "${BACKUP_DIR}"/${BACKUP_PREFIX}*.sql.gz 2>/dev/null | head -n 1 || true)"
if [ -n "${last_file:-}" ] && [ -f "$last_file" ]; then
  last_size_kb="$(du -k "$last_file" | cut -f1)"
fi
need_kb=$(( last_size_kb > 0 ? last_size_kb * 2 : 100 * 1024 ))
if [ "$avail_kb" -lt "$need_kb" ]; then
  echo "[backup] Espaço insuficiente em ${BACKUP_DIR}: avail=${avail_kb}KB need=${need_kb}KB" >&2
  exit 1
fi

# ── Dump ──────────────────────────────────────────────────────────────────────
# --clean / --if-exists: o dump começa por largar objetos antes de os recriar,
# permitindo restaurar sobre uma BD já existente sem mexer no schema.
# --no-owner / --no-privileges: portabilidade entre instâncias com utilizadores
# diferentes (e.g. dev/prod com nomes Postgres distintos).
if ! pg_dump \
      --clean --if-exists \
      --no-owner --no-privileges \
      "$PG_URL" \
    | gzip > "$FILE_PATH"; then
  echo "[backup] pg_dump falhou — a remover ficheiro parcial." >&2
  rm -f "$FILE_PATH"
  exit 1
fi

# ── Integrity check ───────────────────────────────────────────────────────────
if ! gunzip -t "$FILE_PATH" 2>/dev/null; then
  echo "[backup] gunzip -t falhou — ficheiro corrompido, a remover." >&2
  rm -f "$FILE_PATH"
  exit 1
fi

size="$(du -h "$FILE_PATH" | cut -f1)"
echo "[backup] OK: $FILE_PATH ($size)"

# ── Hook off-site opcional ────────────────────────────────────────────────────
if [ -n "${BACKUP_REMOTE_CMD:-}" ]; then
  cmd="${BACKUP_REMOTE_CMD//\{file\}/$FILE_PATH}"
  echo "[backup] A executar BACKUP_REMOTE_CMD: $cmd"
  if ! bash -c "$cmd"; then
    # Falha do hook não inviabiliza o backup local — mas regista no exit code.
    echo "[backup] AVISO: BACKUP_REMOTE_CMD falhou — backup local OK." >&2
  fi
fi

# ── Retenção por prefixo ──────────────────────────────────────────────────────
# Mantemos os N mais recentes do mesmo prefixo. Outros prefixos (e.g.
# gpi_prerestore_) têm o seu próprio cap quando o script é invocado para os
# criar — assim os snapshots de pré-restauro não despejam os backups normais.
to_delete="$(ls -1t "${BACKUP_DIR}"/${BACKUP_PREFIX}*.sql.gz 2>/dev/null \
              | tail -n +$((BACKUP_RETENTION + 1)))"
if [ -n "$to_delete" ]; then
  echo "$to_delete" | xargs -r rm --
  echo "[backup] Retenção ${BACKUP_PREFIX}*: mantidos $BACKUP_RETENTION mais recentes."
fi

# Emite o filename na última linha, para o caller capturar.
echo "$FILENAME"
