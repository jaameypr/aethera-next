#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
# Aethera — One-Command Installer
#
#   curl -fsSL https://raw.githubusercontent.com/jaameypr/aethera-next/master/install.sh | bash
#
# Interactive when run on a terminal (even via curl | bash): asks for an
# optional CurseForge API key and whether to expose the panel through a
# Cloudflare tunnel. Falls back to a non-interactive install when there is
# no terminal (CI), honouring env vars instead.
#
# Environment overrides:
#   AETHERA_DIR        Target directory      (default: ./aethera)
#   AETHERA_TAG        Image tag to deploy   (default: latest)
#   CURSEFORGE_API_KEY Preset CurseForge key (skips the prompt)
#   TUNNEL_TOKEN +     Preset Cloudflare tunnel token and...
#   APP_PUBLIC_URL     ...public URL → enables the tunnel non-interactively
# ─────────────────────────────────────────────

RAW_BASE="https://raw.githubusercontent.com/jaameypr/aethera-next/master"
COMPOSE_FILE="docker-compose.prod.yml"
CF_SETUP="cloudflared-setup.sh"

# Colours
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}[aethera]${NC} $*"; }
warn()  { echo -e "${YELLOW}[aethera]${NC} $*"; }
err()   { echo -e "${RED}[aethera]${NC} $*" >&2; }
step()  { echo -e "${BLUE}»${NC} $*"; }

# ── tty-aware prompts (work even when this script is piped via curl|bash) ──
have_tty() { (exec </dev/tty) 2>/dev/null; }
ask() { # ask VAR "prompt"
  local __v="$1" __p="$2" __a=""
  have_tty || return 1
  printf '%b' "$__p" >/dev/tty
  IFS= read -r __a </dev/tty || true
  printf -v "$__v" '%s' "$__a"
}
ask_secret() { # ask_secret VAR "prompt"
  local __v="$1" __p="$2" __a=""
  have_tty || return 1
  printf '%b' "$__p" >/dev/tty
  IFS= read -rs __a </dev/tty || true
  printf '\n' >/dev/tty
  printf -v "$__v" '%s' "$__a"
}
ask_yn() { # ask_yn "prompt" DEFAULT(Y|N) -> 0 = yes
  local __p="$1" __d="${2:-N}" __a=""
  if ! have_tty; then [ "$__d" = "Y" ]; return; fi
  printf '%b' "$__p" >/dev/tty
  IFS= read -r __a </dev/tty || true
  __a="${__a:-$__d}"
  case "$__a" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

# set_env KEY VALUE — upsert a key in .env. Writes the value verbatim (no sed
# replacement metacharacters), preserving position when the key exists.
set_env() {
  local k="$1" v="$2" tmp
  tmp="$(mktemp)"
  if grep -q "^${k}=" .env 2>/dev/null; then
    VAL="$v" awk -v key="$k" 'index($0, key "=")==1 { print key "=" ENVIRON["VAL"]; next } { print }' .env > "$tmp"
  else
    cp .env "$tmp"
    printf '%s=%s\n' "$k" "$v" >> "$tmp"
  fi
  mv "$tmp" .env
}
read_env() { grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2- || true; }

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

info "Downloading $CF_SETUP ..."
curl -fsSL "${RAW_BASE}/${CF_SETUP}" -o "$CF_SETUP" && chmod +x "$CF_SETUP"

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
  warn "Review .env and set ADMIN_PASSWORD before exposing the panel!"
else
  info ".env already exists — keeping your existing configuration"
fi

# Pin the chosen image tag into .env so compose + cloudflared-setup.sh agree.
export AETHERA_TAG="${AETHERA_TAG:-latest}"
set_env AETHERA_TAG "$AETHERA_TAG"

# ── Optional configuration ───────────────────
# Interactive when a terminal is available; otherwise honour env vars.

WANT_TUNNEL=0

if have_tty; then
  echo ""
  step "Optional configuration (press Enter to skip)"

  # CurseForge API key — only ask if not already set.
  if [ -z "$(read_env CURSEFORGE_API_KEY)" ]; then
    echo ""
    info "CurseForge API key — only needed to deploy CurseForge modpacks."
    echo "  Get one at https://console.curseforge.com/  →  API Keys."
    ask CF_KEY "  CurseForge API key (blank to skip): " || true
    if [ -n "${CF_KEY:-}" ]; then
      set_env CURSEFORGE_API_KEY "$CF_KEY"
      info "Saved CURSEFORGE_API_KEY to .env"
    fi
  fi

  # Cloudflare tunnel — only offer if not already configured.
  if [ ! -f docker-compose.tunnel.yml ] && [ -z "$(read_env TUNNEL_TOKEN)" ]; then
    echo ""
    info "Cloudflare Tunnel — expose the panel over HTTPS without opening a port."
    warn "  (Game-server ports stay published — the tunnel only carries the panel.)"
    if ask_yn "  Set up a Cloudflare tunnel now? [y/N]: " N; then
      echo "  Cloudflare dashboard: Zero Trust → Networks → Tunnels → Create → Cloudflared."
      echo "  Copy the long string after '--token'."
      ask_secret CF_TOKEN "  Paste tunnel token: " || true
      ask CF_HOST "  Public panel hostname (e.g. panel.example.com): " || true
      if [ -n "${CF_TOKEN:-}" ] && [ -n "${CF_HOST:-}" ]; then
        CF_HOST="${CF_HOST#https://}"; CF_HOST="${CF_HOST#http://}"; CF_HOST="${CF_HOST%/}"
        set_env TUNNEL_TOKEN "$CF_TOKEN"
        set_env APP_PUBLIC_URL "https://${CF_HOST}"
        WANT_TUNNEL=1
        info "Tunnel token + public URL saved to .env"
      else
        warn "Token or hostname missing — skipping the tunnel (you can run ./${CF_SETUP} later)."
      fi
    fi
  fi
else
  # Non-interactive: honour preset env vars.
  [ -n "${CURSEFORGE_API_KEY:-}" ] && set_env CURSEFORGE_API_KEY "$CURSEFORGE_API_KEY"
  if [ -n "${TUNNEL_TOKEN:-}" ] && [ -n "${APP_PUBLIC_URL:-}" ]; then
    set_env TUNNEL_TOKEN "$TUNNEL_TOKEN"
    set_env APP_PUBLIC_URL "$APP_PUBLIC_URL"
    WANT_TUNNEL=1
    info "Cloudflare tunnel configured from environment."
  fi
fi

# ── Load config for data dirs + port ─────────

source .env 2>/dev/null || true

DATA_DIR="${AETHERA_DATA_DIR:-./.aethera/run}"
BACKUP_DIR="${AETHERA_BACKUP_DIR:-./.aethera/backup}"
UPLOAD_DIR="${AETHERA_WORLD_UPLOAD_DIR:-./.aethera/world_upload}"

mkdir -p "$DATA_DIR" "$BACKUP_DIR" "$UPLOAD_DIR"
info "Data directories ready"

# ── Pull + start ─────────────────────────────

info "Using image tag: ghcr.io/jaameypr/aethera-next:${AETHERA_TAG}"
info "Pulling images..."
docker compose -f "$COMPOSE_FILE" pull

if [ "$WANT_TUNNEL" = "1" ]; then
  echo ""
  step "Starting Aethera behind a Cloudflare tunnel..."
  chmod +x "$CF_SETUP" 2>/dev/null || true
  # cloudflared-setup.sh is prod-aware and reads TUNNEL_TOKEN + APP_PUBLIC_URL
  # from .env, so it runs non-interactively here.
  ./"$CF_SETUP"
else
  info "Starting Aethera (app + mongo)..."
  docker compose -f "$COMPOSE_FILE" up -d
fi

# ── Done ─────────────────────────────────────

echo ""
if [ "$WANT_TUNNEL" = "1" ]; then
  info "✅  Aethera is running behind your Cloudflare tunnel."
  info "    Public URL:  $(read_env APP_PUBLIC_URL)"
  warn "    Finish the route in the Cloudflare dashboard (see the steps above)."
else
  info "✅  Aethera is running at http://localhost:${APP_PORT:-3000}"
  warn "First run: set ADMIN_PASSWORD in .env, or complete the /setup wizard:"
  warn "    http://localhost:${APP_PORT:-3000}/setup"
fi

echo ""
if [ -z "$(read_env CURSEFORGE_API_KEY)" ]; then
  step "CurseForge modpacks need an API key. To add one later:"
  echo "    1. Edit $(pwd)/.env  →  set  CURSEFORGE_API_KEY=<your key>"
  echo "    2. Apply it:  docker compose -f ${COMPOSE_FILE} up -d   (recreates the app with the new key)"
  echo ""
fi

info "Manage with:  docker compose -f ${COMPOSE_FILE} [logs -f | down | pull]"
if [ "$WANT_TUNNEL" = "1" ] || [ -f docker-compose.tunnel.yml ]; then
  info "Tunnel:       ./${CF_SETUP} --remove   (reopen the host port + drop the tunnel)"
fi
