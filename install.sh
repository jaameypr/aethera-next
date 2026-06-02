#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
# Aethera — One-Command Installer
#
#   curl -fsSL https://raw.githubusercontent.com/jaameypr/aethera-next/master/install.sh | bash
#
# Environment overrides:
#   AETHERA_DIR   Target directory (default: ./aethera)
#   AETHERA_TAG   Image tag to deploy   (default: latest)
# ─────────────────────────────────────────────

RAW_BASE="https://raw.githubusercontent.com/jaameypr/aethera-next/master"
COMPOSE_FILE="docker-compose.prod.yml"

# Colours
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[aethera]${NC} $*"; }
warn()  { echo -e "${YELLOW}[aethera]${NC} $*"; }
err()   { echo -e "${RED}[aethera]${NC} $*" >&2; }

# ── Pre-flight checks ───────────────────────

if ! command -v docker &>/dev/null; then
  err "❌  Docker is not installed. Please install Docker first: https://docs.docker.com/engine/install/"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  err "❌  Docker Compose v2 is required. Please update Docker."
  exit 1
fi

if ! command -v curl &>/dev/null; then
  err "❌  curl is required to download the deployment files."
  exit 1
fi

# ── Target directory ─────────────────────────

AETHERA_DIR="${AETHERA_DIR:-./aethera}"
mkdir -p "$AETHERA_DIR"
cd "$AETHERA_DIR"
info "Installing into $(pwd)"

# ── Download deployment files ────────────────

info "Downloading $COMPOSE_FILE ..."
curl -fsSL "${RAW_BASE}/${COMPOSE_FILE}" -o "$COMPOSE_FILE"

info "Downloading .env.example ..."
curl -fsSL "${RAW_BASE}/.env.example" -o .env.example

# ── .env setup ───────────────────────────────

if [ ! -f .env ]; then
  warn ".env not found — creating from .env.example"
  cp .env.example .env

  # Generate a random JWT secret (matches run.sh)
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
  sed -i "s|<random-64-char-hex>|${JWT_SECRET}|" .env

  # Generate a random MongoDB password (matches run.sh)
  MONGO_PASS=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n' | head -c 32)
  sed -i "s|<random-32-char-hex>|${MONGO_PASS}|" .env

  info "Generated JWT_SECRET and MONGO_PASS in .env"
  warn "Review .env and set ADMIN_PASSWORD before first run!"
else
  info ".env already exists — keeping your existing configuration"
fi

# ── Load config for data dirs + port ─────────

source .env 2>/dev/null || true

DATA_DIR="${AETHERA_DATA_DIR:-./.aethera/run}"
BACKUP_DIR="${AETHERA_BACKUP_DIR:-./.aethera/backup}"
UPLOAD_DIR="${AETHERA_WORLD_UPLOAD_DIR:-./.aethera/world_upload}"

mkdir -p "$DATA_DIR" "$BACKUP_DIR" "$UPLOAD_DIR"
info "Data directories ready"

# ── Pull + start ─────────────────────────────

export AETHERA_TAG="${AETHERA_TAG:-latest}"
info "Using image tag: ghcr.io/jaameypr/aethera-next:${AETHERA_TAG}"

info "Pulling images..."
docker compose -f "$COMPOSE_FILE" pull

info "Starting Aethera (app + mongo)..."
docker compose -f "$COMPOSE_FILE" up -d

# ── Done ─────────────────────────────────────

echo ""
info "✅  Aethera is running at http://localhost:${APP_PORT:-3000}"
echo ""
warn "First run: set ADMIN_PASSWORD in .env, or complete the /setup wizard:"
warn "    http://localhost:${APP_PORT:-3000}/setup"
echo ""
info "Manage with:  docker compose -f ${COMPOSE_FILE} [logs -f | down | pull]"
