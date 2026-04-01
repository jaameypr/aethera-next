#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
# Aethera — Quick Start
# ─────────────────────────────────────────────

COMPOSE_FILE="docker-compose.yml"

# Colours
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[aethera]${NC} $*"; }
warn()  { echo -e "${YELLOW}[aethera]${NC} $*"; }

# ── Pre-flight checks ───────────────────────

if ! command -v docker &>/dev/null; then
  echo "❌  Docker is not installed. Please install Docker first."
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "❌  Docker Compose v2 is required. Please update Docker."
  exit 1
fi

# ── .env setup ───────────────────────────────

if [ ! -f .env ]; then
  warn ".env not found — copying from .env.example"
  cp .env.example .env

  # Generate a random JWT secret
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
  sed -i "s|<random-64-char-hex>|${JWT_SECRET}|" .env

  # Generate a random MongoDB password
  MONGO_PASS=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n' | head -c 32)
  sed -i "s|<random-32-char-hex>|${MONGO_PASS}|" .env

  info "Generated JWT_SECRET and MONGO_PASS in .env"
  warn "Review .env and set ADMIN_PASSWORD before first run!"
fi

# ── Data directories ─────────────────────────

source .env 2>/dev/null || true

DATA_DIR="${AETHERA_DATA_DIR:-./.aethera/run}"
BACKUP_DIR="${AETHERA_BACKUP_DIR:-./.aethera/backup}"
UPLOAD_DIR="${AETHERA_WORLD_UPLOAD_DIR:-./.aethera/world_upload}"

mkdir -p "$DATA_DIR" "$BACKUP_DIR" "$UPLOAD_DIR"
info "Data directories ready"

# ── Parse command ────────────────────────────

CMD="${1:-up}"
shift || true

case "$CMD" in
  up|start)
    info "Starting Aethera (app + mongo)..."
    docker compose -f "$COMPOSE_FILE" up -d --build
    echo ""
    info "✅  Aethera is running at http://localhost:${APP_PORT:-3000}"
    ;;

  down|stop)
    info "Stopping Aethera..."
    docker compose -f "$COMPOSE_FILE" down
    info "Stopped."
    ;;

  restart)
    info "Restarting Aethera..."
    docker compose -f "$COMPOSE_FILE" restart
    info "Restarted."
    ;;

  logs)
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100
    ;;

  rebuild)
    # Pull latest changes, discarding local modifications
    OLD_HASH=$(md5sum "$0" 2>/dev/null | cut -d' ' -f1)
    info "Pulling latest changes..."
    git reset --hard HEAD
    git pull
    chmod +x "$0"

    # Re-exec if run.sh itself was updated (forward all args)
    NEW_HASH=$(md5sum "$0" 2>/dev/null | cut -d' ' -f1)
    if [ "$OLD_HASH" != "$NEW_HASH" ]; then
      warn "run.sh was updated — re-executing..."
      exec "$0" rebuild "$@"
    fi

    # Optional: wipe game-server containers and data
    if [[ " $* " == *" --wipe-servers "* ]]; then
      warn "Wiping all game-server containers and data..."
      CONTAINERS=$(docker ps -a --filter "name=aethera-mc-" --filter "name=aethera-hyt-" -q)
      if [ -n "$CONTAINERS" ]; then
        info "Removing game-server containers..."
        docker rm -f $CONTAINERS
      else
        info "No game-server containers found."
      fi
      if [ -d "$DATA_DIR" ]; then
        info "Deleting server data ($DATA_DIR)..."
        rm -rf "$DATA_DIR"
        mkdir -p "$DATA_DIR"
      fi
      info "✅  Game-server wipe complete."
    fi

    info "Rebuilding and restarting app (keeping database intact)..."
    docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate app
    info "✅  Rebuilt and running."
    ;;

  wipe-servers)
    warn "This will destroy ALL managed game-server containers and their data!"
    read -rp "Are you sure? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      info "Aborted."
      exit 0
    fi

    # Stop and remove all aethera-mc-* and aethera-hyt-* containers
    CONTAINERS=$(docker ps -a --filter "name=aethera-mc-" --filter "name=aethera-hyt-" -q)
    if [ -n "$CONTAINERS" ]; then
      info "Removing game-server containers..."
      docker rm -f $CONTAINERS
    else
      info "No game-server containers found."
    fi

    # Wipe server data directories
    if [ -d "$DATA_DIR" ]; then
      info "Deleting server data ($DATA_DIR)..."
      rm -rf "$DATA_DIR"
      mkdir -p "$DATA_DIR"
    fi

    info "✅  All game-server containers and data wiped."
    ;;

  status)
    docker compose -f "$COMPOSE_FILE" ps
    ;;

  seed)
    info "Running seed script..."
    docker compose -f "$COMPOSE_FILE" exec app node -e "
      import('./scripts/seed.mjs').catch(console.error)
    " 2>/dev/null || \
    docker compose -f "$COMPOSE_FILE" exec app npx tsx scripts/seed.ts
    ;;

  *)
    echo "Usage: ./run.sh [up|down|restart|logs|rebuild|status|seed]"
    echo ""
    echo "  up / start     Build and start all services"
    echo "  down / stop    Stop all services"
    echo "  restart        Restart services"
    echo "  logs           Tail container logs"
    echo "  rebuild        Force rebuild and restart (--wipe-servers to clean MC data)"
    echo "  wipe-servers   Remove all game-server containers and data"
    echo "  status         Show container status"
    echo "  seed           Run the admin seed script"
    exit 1
    ;;
esac
