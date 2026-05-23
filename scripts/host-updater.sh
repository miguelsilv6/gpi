#!/usr/bin/env bash
# Host-side daemon do fluxo de auto-atualização do GPI.
#
# Lê triggers escritos por /api/updates/start (em ./control/update.request.json)
# e executa a sequência:
#   git fetch + checkout → migrate → build → up -d → healthcheck
# Em qualquer falha, faz rollback automático (git checkout do SHA original +
# bash scripts/restore.sh do backup pré-atualização).
#
# Reporta progresso a cada transição em ./control/update.status.json — esse
# ficheiro é lido pelo worker do GPI e propagado para a tabela
# `AtualizacaoSistema`.
#
# Instalado como systemd service + timer (./scripts/systemd/gpi-updater.*).
# Pode ser corrido manualmente para teste: GPI_DIR=/opt/gpi bash scripts/host-updater.sh
#
# Variáveis de ambiente (com defaults):
#   GPI_DIR        diretório do repo no host                (/opt/gpi)
#   CONTROL_DIR    diretório partilhado de controlo         ($GPI_DIR/control)
#   HOST_PORT      porta exposta pelo container app         (3000)
#   COMPOSE_FILE   path do compose                          ($GPI_DIR/docker-compose.prod.yml)
#   HEALTH_TIMEOUT segundos a esperar pelo /api/health      (120)
#   LOCK_FILE      lock partilhado com backup/restore       (/var/lock/gpi-updater.lock)

set -euo pipefail

GPI_DIR="${GPI_DIR:-/opt/gpi}"
CONTROL_DIR="${CONTROL_DIR:-$GPI_DIR/control}"
HOST_PORT="${HOST_PORT:-3000}"
COMPOSE_FILE="${COMPOSE_FILE:-$GPI_DIR/docker-compose.prod.yml}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
LOCK_FILE="${LOCK_FILE:-/var/lock/gpi-updater.lock}"

TRIGGER_FILE="$CONTROL_DIR/update.request.json"
STATUS_FILE="$CONTROL_DIR/update.status.json"
LOG_FILE="${LOG_FILE:-/var/log/gpi-updater.log}"

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
else
  DC="docker-compose"
fi

log() {
  local ts
  ts="$(date -Iseconds)"
  local msg="[gpi-updater] $ts $*"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

# Escrita atómica do ficheiro de status. Usa python3 para serializar JSON
# com escape correto (mensagens de erro podem ter aspas, newlines, etc.).
write_status() {
  local state="$1"
  local error="${2:-}"
  local toSha="${3:-}"
  local tmp="$STATUS_FILE.tmp.$$"
  REQUEST_ID="$REQUEST_ID" STATE="$state" ERROR="$error" TO_SHA="$toSha" \
    python3 -c '
import json, os
from datetime import datetime, timezone
out = {
    "requestId": os.environ["REQUEST_ID"],
    "state": os.environ["STATE"],
    "updatedAt": datetime.now(timezone.utc).isoformat(),
}
if os.environ.get("ERROR"):
    out["errorMessage"] = os.environ["ERROR"]
if os.environ.get("TO_SHA"):
    out["toCommitSha"] = os.environ["TO_SHA"]
print(json.dumps(out))
' > "$tmp"
  mv "$tmp" "$STATUS_FILE"
  log "→ $state${error:+ (err: $error)}"
}

# Parsing seguro de um campo do trigger via python3.
trigger_field() {
  local key="$1"
  TRIGGER_FILE="$TRIGGER_FILE" KEY="$key" python3 -c '
import json, os, sys
with open(os.environ["TRIGGER_FILE"]) as f:
    data = json.load(f)
print(data.get(os.environ["KEY"], ""))
'
}

# Apaga o trigger para que este daemon não o re-processe.
consume_trigger() {
  rm -f "$TRIGGER_FILE"
}

# Limpa o modo de manutenção via psql no container postgres. Não bloqueante.
clear_maintenance() {
  $DC -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" \
    -c "UPDATE \"ConfiguracaoSistema\" SET \"maintenanceMode\"=false WHERE id='singleton';" \
    >/dev/null 2>&1 || log "AVISO: falha ao limpar maintenanceMode (continuando)"
}

# Healthcheck: tenta GET /api/health durante HEALTH_TIMEOUT segundos.
wait_healthy() {
  local deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -sf "http://127.0.0.1:${HOST_PORT}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# Rollback: restaura código + BD + reinicia containers.
do_rollback() {
  local reason="$1"
  log "ROLLBACK iniciado: $reason"
  write_status "ROLLING_BACK" "$reason"
  cd "$GPI_DIR"

  if ! git checkout "$FROM_SHA" --detach 2>&1 | tee -a "$LOG_FILE"; then
    log "FALHA CRÍTICA: git checkout $FROM_SHA não foi possível"
    write_status "FAILED" "Rollback falhou: git checkout $FROM_SHA"
    consume_trigger
    return 1
  fi

  # Restore da BD a partir do backup pré-atualização. O restore.sh é
  # single-transaction com ON_ERROR_STOP=1, atómico.
  if ! $DC -f "$COMPOSE_FILE" run --rm \
        -e BACKUP_DIR=/app/backups \
        app bash scripts/restore.sh "/app/backups/${PRE_BACKUP_FILE}" 2>&1 \
        | tee -a "$LOG_FILE"; then
    log "FALHA CRÍTICA: restore.sh falhou"
    write_status "FAILED" "Rollback falhou: restore.sh não conseguiu restaurar $PRE_BACKUP_FILE"
    consume_trigger
    return 1
  fi

  # Rebuild com o SHA original e up -d.
  if ! $DC -f "$COMPOSE_FILE" up -d --build app worker 2>&1 | tee -a "$LOG_FILE"; then
    log "FALHA CRÍTICA: docker compose up falhou após rollback"
    write_status "FAILED" "Rollback falhou: docker compose up"
    consume_trigger
    return 1
  fi

  if ! wait_healthy; then
    log "FALHA CRÍTICA: healthcheck pós-rollback falhou"
    write_status "FAILED" "Rollback falhou: healthcheck"
    consume_trigger
    return 1
  fi

  clear_maintenance
  write_status "ROLLED_BACK" "$reason"
  consume_trigger
  log "Rollback concluído com sucesso"
}

# ── MAIN ────────────────────────────────────────────────────────────────────
[ -f "$TRIGGER_FILE" ] || exit 0

# Lock partilhado com backup/restore para evitar interleaving.
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  log "Outro processo (backup/restore/update) detém o lock — a sair"
  exit 0
fi

REQUEST_ID="$(trigger_field requestId)"
FROM_SHA="$(trigger_field fromSha)"
TO_TAG="$(trigger_field toTag)"
PRE_BACKUP_FILE="$(trigger_field preBackupFile)"

if [ -z "$REQUEST_ID" ] || [ -z "$FROM_SHA" ] || [ -z "$TO_TAG" ] || [ -z "$PRE_BACKUP_FILE" ]; then
  log "Trigger inválido — campos em falta. A remover."
  consume_trigger
  exit 1
fi

log "Trigger recebido: requestId=$REQUEST_ID toTag=$TO_TAG fromSha=$FROM_SHA"

cd "$GPI_DIR"

# Carregar variáveis do .env (POSTGRES_USER, POSTGRES_DB) para o psql.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# ── PULLING ────────────────────────────────────────────────────────────────
write_status "PULLING"
if ! git fetch --tags --prune origin 2>&1 | tee -a "$LOG_FILE"; then
  do_rollback "git fetch falhou"
  exit 0
fi
if ! git checkout --detach "tags/${TO_TAG}" 2>&1 | tee -a "$LOG_FILE"; then
  do_rollback "git checkout tags/${TO_TAG} falhou"
  exit 0
fi
TO_SHA="$(git rev-parse HEAD)"
log "checkout OK: $TO_SHA"

# ── MIGRATING ──────────────────────────────────────────────────────────────
# Corre `prisma migrate deploy` num container efémero da imagem nova.
# Build-arg para que o GIT_SHA fique consistente no run efémero.
write_status "MIGRATING" "" "$TO_SHA"
if ! $DC -f "$COMPOSE_FILE" run --rm \
      --build app sh -c "npx prisma migrate deploy" 2>&1 \
      | tee -a "$LOG_FILE"; then
  do_rollback "prisma migrate deploy falhou"
  exit 0
fi

# ── BUILDING ───────────────────────────────────────────────────────────────
# O build acima (--build no run) já gerou as imagens com GIT_SHA correto, mas
# corremos novamente em modo build puro para o caso de o cache ter sido
# invalidado entre os dois passos. Idempotente.
write_status "BUILDING" "" "$TO_SHA"
if ! $DC -f "$COMPOSE_FILE" build \
      --build-arg "GIT_SHA=$TO_SHA" \
      app worker 2>&1 | tee -a "$LOG_FILE"; then
  do_rollback "docker compose build falhou"
  exit 0
fi

# ── RESTARTING ─────────────────────────────────────────────────────────────
write_status "RESTARTING" "" "$TO_SHA"
if ! $DC -f "$COMPOSE_FILE" up -d app worker 2>&1 | tee -a "$LOG_FILE"; then
  do_rollback "docker compose up falhou"
  exit 0
fi

# ── HEALTHCHECK ────────────────────────────────────────────────────────────
write_status "HEALTHCHECK" "" "$TO_SHA"
if ! wait_healthy; then
  do_rollback "healthcheck falhou após $HEALTH_TIMEOUT s"
  exit 0
fi

# ── DONE ───────────────────────────────────────────────────────────────────
clear_maintenance
write_status "DONE" "" "$TO_SHA"
consume_trigger
log "Update concluído: $TO_TAG ($TO_SHA)"
