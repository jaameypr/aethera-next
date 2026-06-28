#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
# Aethera — Cloudflare Tunnel Setup (optional bolt-on)
#
# Closes the panel UI port on the host and routes the panel through a
# Cloudflare Named Tunnel (HTTPS). Works in two modes, auto-detected:
#
#   • dev  — source checkout with run.sh + docker-compose.yml
#   • prod — pulled-image install with docker-compose.prod.yml (no run.sh)
#
# Token + hostname are taken from (in order): environment, existing .env,
# then an interactive prompt — so it can be driven non-interactively by
# install.sh (which writes them to .env first) or run by hand later.
#
# Set up    : ./cloudflared-setup.sh
# Tear down : ./cloudflared-setup.sh --remove
#
# Non-interactive (e.g. from install.sh):
#   TUNNEL_TOKEN=... CF_HOSTNAME=panel.example.com ./cloudflared-setup.sh
#
# IMPORTANT: The tunnel only carries the HTTP panel port. Game-server
# ports (TCP 25565 etc.) stay published on the host unchanged — players
# still connect directly to Host:<port>.
# ─────────────────────────────────────────────

TUNNEL_FILE="docker-compose.tunnel.yml"
PROFILE_FILE=".aethera.profile"

# Colours
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${GREEN}[cloudflared]${NC} $*"; }
warn() { echo -e "${YELLOW}[cloudflared]${NC} $*"; }
err()  { echo -e "${RED}[cloudflared]${NC} $*" >&2; }
step() { echo -e "${BLUE}»${NC} $*"; }

# ── tty-aware prompts (work even when invoked from a piped installer) ──
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

# set_env KEY VALUE  — upsert a key in .env. Writes the value verbatim (no sed
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

# read_env KEY  — read a key's value from .env (empty if missing)
read_env() {
  grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2- || true
}

# ── Mode detection: dev (run.sh present) vs prod (pulled image) ──
if [ -f run.sh ] && [ -f docker-compose.yml ]; then
  MODE="dev"; BASE_COMPOSE="docker-compose.yml"
elif [ -f docker-compose.prod.yml ]; then
  MODE="prod"; BASE_COMPOSE="docker-compose.prod.yml"
elif [ -f docker-compose.yml ]; then
  MODE="prod"; BASE_COMPOSE="docker-compose.yml"
else
  err "No docker-compose file found in $(pwd)."
  exit 1
fi

# Bring the stack up — with or without the tunnel overlay — honouring mode.
stack_up_tunnel() {
  if [ "$MODE" = "dev" ]; then
    chmod +x run.sh 2>/dev/null || true
    ./run.sh up
  else
    docker compose -f "$BASE_COMPOSE" -f "$TUNNEL_FILE" --profile tunnel up -d
  fi
}
stack_up_plain() {
  if [ "$MODE" = "dev" ]; then
    chmod +x run.sh 2>/dev/null || true
    ./run.sh up
  else
    docker compose -f "$BASE_COMPOSE" up -d
  fi
}

# ── --remove: tear down ───────────────────────
if [ "${1:-}" = "--remove" ]; then
  warn "Removing Cloudflare tunnel and reopening the panel port..."
  if [ -f "$TUNNEL_FILE" ]; then
    docker compose -f "$BASE_COMPOSE" -f "$TUNNEL_FILE" --profile tunnel rm -sf cloudflared 2>/dev/null || true
  fi
  rm -f "$TUNNEL_FILE" "$PROFILE_FILE"
  [ -f .env ] && set_env APP_BIND 0.0.0.0
  info "Restarting stack with the published port..."
  stack_up_plain
  info "✅  Tunnel removed — panel port is published again."
  exit 0
fi

# ── Preflight ─────────────────────────────────
command -v docker >/dev/null 2>&1 || { err "Docker is not installed."; exit 1; }
docker compose version >/dev/null 2>&1 || { err "Docker Compose v2 is required."; exit 1; }
[ -f .env ] || { err ".env missing — run the installer (or './run.sh up') once first to bootstrap it."; exit 1; }

# Detect compose version for '!reset' support (>= 2.24.0)
COMPOSE_VER=$(docker compose version --short 2>/dev/null | tr -d 'v ' || echo "0.0.0")
supports_reset() {
  local maj min
  maj=$(echo "$COMPOSE_VER" | cut -d. -f1)
  min=$(echo "$COMPOSE_VER" | cut -d. -f2)
  [ "${maj:-0}" -gt 2 ] 2>/dev/null && return 0
  { [ "${maj:-0}" -eq 2 ] && [ "${min:-0}" -ge 24 ]; } 2>/dev/null && return 0
  return 1
}

echo ""
info "Cloudflare Tunnel setup for the Aethera panel (${MODE} mode)"
echo ""
echo "  This closes the panel UI port on the host and routes the panel"
echo "  through a Cloudflare Named Tunnel (HTTPS)."
echo ""
warn "  Game-server ports are NOT affected. A Cloudflare tunnel only"
warn "  carries the HTTP panel — players still connect to Host:<port>"
warn "  directly, so those ports stay published on the host."
echo ""

# ── Step 1: Token (env → .env → prompt) ───────
step "Step 1/3 — Cloudflare Tunnel token"
TUNNEL_TOKEN="${TUNNEL_TOKEN:-$(read_env TUNNEL_TOKEN)}"
if [ -z "${TUNNEL_TOKEN:-}" ]; then
  echo "  Get one from the Cloudflare dashboard:"
  echo "    Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared"
  echo "  Copy the long string after '--token' in the shown install command."
  echo ""
  ask_secret TUNNEL_TOKEN "  Paste tunnel token: " || true
else
  info "Using tunnel token from environment/.env"
fi
[ -n "${TUNNEL_TOKEN:-}" ] || { err "Token is required (set TUNNEL_TOKEN or run interactively)."; exit 1; }

# ── Step 2: Hostname (CF_HOSTNAME → APP_PUBLIC_URL → prompt) ──
echo ""
step "Step 2/3 — Public hostname"
PUBLIC_HOST="${CF_HOSTNAME:-}"
if [ -z "$PUBLIC_HOST" ]; then
  existing_url="$(read_env APP_PUBLIC_URL)"
  PUBLIC_HOST="${existing_url#https://}"; PUBLIC_HOST="${PUBLIC_HOST#http://}"; PUBLIC_HOST="${PUBLIC_HOST%/}"
fi
if [ -z "$PUBLIC_HOST" ]; then
  echo "  The hostname you will map to this tunnel (e.g. panel.example.com)."
  echo "  The domain must already be managed by Cloudflare."
  echo ""
  ask PUBLIC_HOST "  Public panel hostname: " || true
fi
[ -n "${PUBLIC_HOST:-}" ] || { err "Hostname is required (set CF_HOSTNAME/APP_PUBLIC_URL or run interactively)."; exit 1; }
# Normalise: strip scheme + trailing slash
PUBLIC_HOST="${PUBLIC_HOST#https://}"; PUBLIC_HOST="${PUBLIC_HOST#http://}"; PUBLIC_HOST="${PUBLIC_HOST%/}"

# ── Persist to .env ───────────────────────────
set_env TUNNEL_TOKEN "$TUNNEL_TOKEN"
set_env APP_PUBLIC_URL "https://${PUBLIC_HOST}"

# ── Step 3: Generate overlay ──────────────────
echo ""
step "Step 3/3 — Generating the compose overlay"
if supports_reset; then
  CLOSE_BLOCK='    ports: !reset []          # host publish removed — panel port fully closed'
  set_env APP_BIND 0.0.0.0
  info "Compose v${COMPOSE_VER} supports '!reset' — panel port fully unpublished."
else
  CLOSE_BLOCK='    # compose < 2.24: cannot drop ports here — panel bound to loopback via APP_BIND=127.0.0.1'
  set_env APP_BIND 127.0.0.1
  warn "Compose v${COMPOSE_VER} < 2.24 — falling back to loopback bind (127.0.0.1)."
fi

cat > "$TUNNEL_FILE" <<YAML
# ─────────────────────────────────────────────
# GENERATED by cloudflared-setup.sh — do not edit by hand.
# Remove with:  ./cloudflared-setup.sh --remove
#
# Closes the panel UI port and runs a Cloudflare tunnel on the
# aethera-net bridge. cloudflared reaches the app at http://app:3000.
# ─────────────────────────────────────────────
services:
  app:
${CLOSE_BLOCK}

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: aethera-cloudflared
    restart: unless-stopped
    profiles: [tunnel]
    command: tunnel --no-autoupdate run --token \${TUNNEL_TOKEN}
    networks:
      - aethera-net
    depends_on:
      - app
YAML

cat > "$PROFILE_FILE" <<PROFILE
# GENERATED by cloudflared-setup.sh — tells run.sh which compose files
# and profiles to layer in. Remove with: ./cloudflared-setup.sh --remove
COMPOSE_FILES="-f ${BASE_COMPOSE} -f ${TUNNEL_FILE}"
COMPOSE_PROFILES="tunnel"
PROFILE

info "Wrote ${TUNNEL_FILE} and ${PROFILE_FILE}"

# ── Bring the stack up with the tunnel ────────
echo ""
step "Bringing the stack up with the tunnel..."
stack_up_tunnel

# ── Route instructions ────────────────────────
echo ""
info "✅  cloudflared is running and the panel port is closed on the host."
echo ""
echo -e "${BLUE}── Finish the route in the Cloudflare dashboard ──${NC}"
echo "  1. Zero Trust → Networks → Tunnels → (your tunnel) → Configure"
echo "  2. Open the 'Public Hostname' tab → 'Add a public hostname':"
echo "       Subdomain / Domain : ${PUBLIC_HOST}"
echo "       Type               : HTTP"
echo "       URL                : app:3000"
echo "  3. Save — Cloudflare auto-creates the DNS (CNAME) record."
echo ""
echo "  Panel will be reachable at:  https://${PUBLIC_HOST}"
echo ""
warn "  Reminder: game-server ports are still published on the host."
echo ""
if [ "$MODE" = "prod" ]; then
  step "Manage the tunnelled stack with:"
  echo "    docker compose -f ${BASE_COMPOSE} -f ${TUNNEL_FILE} --profile tunnel [logs -f | down | up -d]"
  step "Watch tunnel health:  docker compose -f ${BASE_COMPOSE} -f ${TUNNEL_FILE} --profile tunnel logs -f cloudflared"
else
  step "Watch tunnel health with:  docker compose logs -f cloudflared"
fi
