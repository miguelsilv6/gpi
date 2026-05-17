#!/usr/bin/env bash
# GPI — instalação click-and-play em Linux / macOS.
# Pré-requisitos: git, docker, docker compose plugin (ou docker-compose).
#
# Uso (one-liner):
#   curl -fsSL https://raw.githubusercontent.com/miguelsilv6/gestao-projetos/main/scripts/install.sh | bash
#
# Uso (clone manual):
#   git clone https://github.com/miguelsilv6/gestao-projetos.git && cd gestao-projetos
#   ./scripts/install.sh

set -euo pipefail

# ─── Configurable ─────────────────────────────────────────────────────────────
REPO_URL="${GPI_REPO_URL:-https://github.com/miguelsilv6/gestao-projetos.git}"
REPO_BRANCH="${GPI_REPO_BRANCH:-main}"
INSTALL_DIR="${GPI_INSTALL_DIR:-$HOME/gpi}"
DEFAULT_PORT="${HOST_PORT:-3000}"

# ─── Style helpers ────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_BOLD='\033[1m'; C_RESET='\033[0m'
  C_GREEN='\033[0;32m'; C_BLUE='\033[0;34m'; C_YELLOW='\033[0;33m'; C_RED='\033[0;31m'
else
  C_BOLD=''; C_RESET=''; C_GREEN=''; C_BLUE=''; C_YELLOW=''; C_RED=''
fi
info()  { printf "${C_BLUE}▸${C_RESET} %s\n" "$*"; }
ok()    { printf "${C_GREEN}✓${C_RESET} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}⚠${C_RESET} %s\n" "$*"; }
fail()  { printf "${C_RED}✗${C_RESET} %s\n" "$*" >&2; exit 1; }
title() { printf "\n${C_BOLD}%s${C_RESET}\n" "$*"; }

# ─── Pre-flight checks ────────────────────────────────────────────────────────
title "GPI — Instalação"
info "Diretório alvo: $INSTALL_DIR"

command -v git >/dev/null 2>&1 || fail "Git não encontrado. Instala-o: https://git-scm.com/downloads"

if ! command -v docker >/dev/null 2>&1; then
  fail "Docker não encontrado. Instala o Docker Desktop: https://www.docker.com/products/docker-desktop/"
fi

# Determine docker compose command (plugin vs legacy)
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  fail "docker compose plugin não encontrado. Atualiza o Docker Desktop ou instala o docker compose."
fi
ok "Comando compose: $DC"

if ! docker info >/dev/null 2>&1; then
  fail "Docker daemon não está a correr. Inicia o Docker Desktop e volta a tentar."
fi
ok "Docker daemon OK"

# ─── Secret generation ────────────────────────────────────────────────────────
gen_secret() {
  # 32 hex chars (~128 bits) — funciona em qualquer Linux/Mac.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    # Fallback: /dev/urandom
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

gen_password() {
  # 24 caracteres alfanuméricos seguros para Postgres
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 24
  else
    head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24
  fi
}

# ─── Port detection ───────────────────────────────────────────────────────────
port_in_use() {
  local p=$1
  # Tenta vários métodos consoante o que estiver disponível
  if command -v lsof >/dev/null 2>&1; then
    lsof -i ":$p" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -tln "sport = :$p" 2>/dev/null | grep -q ":$p"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | grep -q "\\.${p} .*LISTEN"
  else
    return 1  # Sem ferramentas, assumir livre
  fi
}

find_free_port() {
  local p=$DEFAULT_PORT
  for _ in 1 2 3 4 5; do
    if ! port_in_use "$p"; then
      echo "$p"; return 0
    fi
    p=$((p + 1))
  done
  echo ""
}

# ─── Clone or update repo ─────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Diretório já existe — a atualizar via 'git pull'..."
  cd "$INSTALL_DIR"
  git fetch --quiet origin "$REPO_BRANCH"
  git checkout --quiet "$REPO_BRANCH"
  git pull --quiet --ff-only origin "$REPO_BRANCH" || warn "git pull falhou — a continuar com o snapshot existente"
  ok "Repo atualizado"
elif [ -d "$INSTALL_DIR" ] && [ "$(ls -A "$INSTALL_DIR")" ]; then
  fail "$INSTALL_DIR já existe e não é um repo git. Apaga-o ou escolhe outro destino (GPI_INSTALL_DIR=...)."
else
  info "A clonar $REPO_URL..."
  git clone --quiet --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  ok "Repo clonado para $INSTALL_DIR"
fi

# ─── Generate .env (only if missing) ──────────────────────────────────────────
if [ -f .env ]; then
  warn ".env já existe — a preservar configuração actual"
else
  info "A gerar .env com secrets aleatórios..."
  PORT=$(find_free_port)
  if [ -z "$PORT" ]; then
    fail "Não foi possível encontrar um porto livre a partir de $DEFAULT_PORT."
  fi
  if [ "$PORT" != "$DEFAULT_PORT" ]; then
    warn "Porto $DEFAULT_PORT ocupado — a usar $PORT"
  fi

  NEXTAUTH_SECRET=$(gen_secret)
  CRON_SECRET=$(gen_secret)
  POSTGRES_PASSWORD=$(gen_password)

  cat > .env <<EOF
HOST_PORT=$PORT

POSTGRES_USER=gpi_user
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=gpi_db

NEXTAUTH_SECRET=$NEXTAUTH_SECRET
NEXTAUTH_URL=http://localhost:$PORT

SEED_PASSWORD=Admin123!

CRON_SECRET=$CRON_SECRET

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM_NAME=GPI Sistema
SMTP_FROM_EMAIL=noreply@gpi.local
EOF
  chmod 600 .env
  ok ".env criado em $INSTALL_DIR/.env"
fi

# Read HOST_PORT for the rest of the script
HOST_PORT_VAL=$(grep -E '^HOST_PORT=' .env | head -n1 | cut -d= -f2)
HOST_PORT_VAL=${HOST_PORT_VAL:-3000}

# ─── Build and start ──────────────────────────────────────────────────────────
title "A construir e arrancar (pode demorar 5-10 min no primeiro arranque)"
$DC -f docker-compose.prod.yml up -d --build

# ─── Wait for health ──────────────────────────────────────────────────────────
title "A esperar pela aplicação..."
HEALTH_URL="http://localhost:$HOST_PORT_VAL/api/health"
for i in $(seq 1 90); do
  if curl -fsS -o /dev/null --max-time 2 "$HEALTH_URL"; then
    ok "Aplicação saudável em $HEALTH_URL"
    break
  fi
  if [ "$i" = 90 ]; then
    warn "Health check sem resposta após 90s. Verifica os logs: $DC -f docker-compose.prod.yml logs -f"
  fi
  printf "."
  sleep 1
done
echo

# ─── Open browser ─────────────────────────────────────────────────────────────
URL="http://localhost:$HOST_PORT_VAL"
if [ "${GPI_NO_OPEN:-0}" != "1" ]; then
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 || true
  fi
fi

# ─── Final summary ────────────────────────────────────────────────────────────
SEED_PWD=$(grep -E '^SEED_PASSWORD=' .env | head -n1 | cut -d= -f2)
SEED_PWD=${SEED_PWD:-Admin123!}

title "✅ GPI pronto"
echo
printf "  URL:           ${C_BOLD}%s${C_RESET}\n" "$URL"
printf "  Login admin:   ${C_BOLD}admin@gpi.pt${C_RESET} / ${C_BOLD}%s${C_RESET}\n" "$SEED_PWD"
echo
echo "Comandos úteis (a partir de $INSTALL_DIR):"
echo "  Ver logs:      $DC -f docker-compose.prod.yml logs -f"
echo "  Parar:         $DC -f docker-compose.prod.yml stop"
echo "  Reiniciar:     $DC -f docker-compose.prod.yml restart"
echo "  Atualizar:     ./scripts/update.sh"
echo "  Desinstalar:   ./scripts/uninstall.sh"
echo
